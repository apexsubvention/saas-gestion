// Moteur de correspondance « Parle-moi de ton projet ».
//
// Remplace l'ancien comportement (qui appelait fundingSearchScore() sur le texte libre,
// exactement comme la barre de recherche) par un score à plusieurs facteurs, chacun
// explicable et calculé à partir de données réellement présentes en base :
//   1. correspondance thématique (lexicale, via search.ts)
//   2. admissibilité territoriale
//   3. adéquation financière (budget du projet vs seuils du programme)
//   4. disponibilité temporelle (ouvert / ouverture bientôt / fermé)
//   5. priorités du programme et priorités gouvernementales
//   6. projets historiquement similaires déjà financés (funding_awards)
//
// Le résultat est volontairement appelé "score de pertinence" : ce n'est jamais une
// probabilité d'acceptation. Chaque point du score est traçable à une raison humainement
// lisible (reasons) ou, à l'inverse, à un point à vérifier (criteriaToVerify) — jamais un
// nombre nu.
import { fundingSearchScore, matchedIntentGroups, normalizeSearchText, type SearchableFundingOpportunity } from "./search";

// --- 1. Extraction de signaux structurés depuis le texte libre --------------------------

export type ProjectSignals = {
  rawText: string;
  location: { label: string | null; territory: "Québec" | "Canada" | null };
  employeeCount: number | null;
  budgetAmount: number | null;
  intentGroups: string[];
};

// Villes du Québec les plus courantes dans ce type de description. Liste volontairement
// bornée et non exhaustive (voir l'audit du 11 sept. 2026, section Géographie, pour le
// chantier d'un vrai référentiel Canada → Province → Région → MRC → Municipalité) : le but
// ici est de reconnaître les cas fréquents, pas de couvrir les ~1100 municipalités du Québec.
const QUEBEC_CITIES = [
  "granby", "montreal", "quebec", "laval", "gatineau", "sherbrooke", "trois-rivieres",
  "saguenay", "levis", "longueuil", "drummondville", "saint-jean-sur-richelieu",
  "shawinigan", "rimouski", "victoriaville", "rouyn-noranda", "val-d'or", "joliette",
  "saint-hyacinthe", "sorel-tracy", "alma", "sept-iles", "baie-comeau", "thetford mines",
  "cowansville", "magog", "boucherville", "brossard", "terrebonne", "repentigny",
  "mascouche", "sainte-therese", "salaberry-de-valleyfield", "chateauguay", "beloeil",
];

function extractLocation(normalizedText: string): ProjectSignals["location"] {
  const city = QUEBEC_CITIES.find((c) => normalizedText.includes(normalizeSearchText(c)));
  if (city) return { label: city, territory: "Québec" };
  if (/\bquebec\b/.test(normalizedText)) return { label: "Québec", territory: "Québec" };
  if (/\bcanada\b/.test(normalizedText)) return { label: "Canada", territory: "Canada" };
  return { label: null, territory: null };
}

function extractEmployeeCount(text: string): number | null {
  const match = text.match(/(\d{1,4})\s*(?:employe|employés|employes|employé[e(]s?\)?s?|personnes|travailleurs|salariés|salaries)/i);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

function extractBudget(text: string): number | null {
  // Heuristique volontairement simple : on prend le plus grand montant suivi (ou précédé)
  // d'un symbole $ dans le texte. Dans une description de projet ("CRM à 40 000 $ et
  // formation de 6 employés"), le budget total est généralement le montant le plus élevé
  // mentionné avec $. Ce n'est pas infaillible — d'où son statut de signal, pas de vérité.
  const matches = [...text.matchAll(/([0-9][0-9\s,.]*)\s*\$|\$\s*([0-9][0-9\s,.]*)/g)];
  const amounts = matches
    .map((m) => (m[1] ?? m[2] ?? "").replace(/[\s,]/g, ""))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 100);
  return amounts.length ? Math.max(...amounts) : null;
}

export function extractProjectSignals(rawText: string): ProjectSignals {
  const normalizedText = normalizeSearchText(rawText);
  return {
    rawText,
    location: extractLocation(normalizedText),
    employeeCount: extractEmployeeCount(rawText),
    budgetAmount: extractBudget(rawText),
    intentGroups: matchedIntentGroups(rawText),
  };
}

// --- 2. Ce que le moteur a besoin de connaître sur un programme et un projet financé ----

export type OpportunityForMatch = SearchableFundingOpportunity & {
  id: string;
  territory?: string | null;
  max_amount?: number | null;
  min_amount?: number | null;
  min_eligible_spend?: number | null;
  funding_rate_max?: number | null;
  deadline?: string | null;
  availability_status?: string | null;
  expected_open_date?: string | null;
  government_priorities?: string[] | null;
  assessment_criteria?: string | null;
};

export type FundingAwardForMatch = {
  id: string;
  recipient_name: string | null;
  project_title: string | null;
  description: string | null;
  amount: number | null;
  location: string | null;
};

export type ProjectMatchResult = {
  score: number;
  priorityLabel: "Prioritaire" | "À évaluer" | "Pertinence faible";
  reasons: string[];
  criteriaToVerify: string[];
  potentialAmount: number | null;
  potentialRate: number | null;
  deadlineStatus: string;
  similarAwards: FundingAwardForMatch[];
};

function scoreThematicFit(signals: ProjectSignals, opportunity: OpportunityForMatch) {
  const lexical = fundingSearchScore(signals.rawText, opportunity); // 0-100, déterministe (search.ts)
  const reasons: string[] = [];
  const concerns: string[] = [];
  if (lexical > 0) {
    const groups = signals.intentGroups.length ? ` (${signals.intentGroups.join(", ")})` : "";
    reasons.push(`Le texte du projet correspond au contenu du programme${groups} — score lexical ${lexical}/100.`);
  } else {
    concerns.push("Aucune correspondance thématique claire entre le texte du projet et ce programme.");
  }
  return { fraction: lexical / 100, reasons, concerns };
}

function scoreTerritory(signals: ProjectSignals, opportunity: OpportunityForMatch) {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const programTerritory = opportunity.territory ?? null;
  if (!signals.location.territory) {
    concerns.push("Localisation de l’entreprise non identifiée dans le texte : l’admissibilité géographique n’a pas pu être vérifiée automatiquement.");
    return { fraction: 0.5, reasons, concerns }; // neutre : ni pénalisé ni favorisé
  }
  if (!programTerritory || programTerritory === "Canada" || programTerritory === signals.location.territory) {
    reasons.push(programTerritory ? `Le programme couvre le territoire de l’entreprise (${programTerritory}).` : "Territoire du programme non restreint dans les données actuelles.");
    return { fraction: 1, reasons, concerns };
  }
  concerns.push(`Le programme semble couvrir « ${programTerritory} », alors que l’entreprise paraît basée en ${signals.location.territory} : vérifier l’admissibilité géographique avant de préparer le dossier.`);
  return { fraction: 0.05, reasons, concerns };
}

function scoreFinancialFit(signals: ProjectSignals, opportunity: OpportunityForMatch) {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const minSpend = opportunity.min_eligible_spend ?? null;
  if (signals.budgetAmount == null || minSpend == null) {
    concerns.push("Budget du projet ou seuil minimal du programme non précisé : l’adéquation financière n’a pas pu être vérifiée automatiquement.");
    return { fraction: 0.5, reasons, concerns };
  }
  if (signals.budgetAmount >= minSpend) {
    reasons.push(`Le budget mentionné (${formatMoney(signals.budgetAmount)}) atteint le minimum de dépenses admissibles du programme (${formatMoney(minSpend)}).`);
    return { fraction: 1, reasons, concerns };
  }
  concerns.push(`Le budget mentionné (${formatMoney(signals.budgetAmount)}) est inférieur au minimum de dépenses admissibles du programme (${formatMoney(minSpend)}) : le projet pourrait ne pas être admissible tel quel.`);
  return { fraction: 0.1, reasons, concerns };
}

function scoreAvailability(opportunity: OpportunityForMatch) {
  const reasons: string[] = [];
  const concerns: string[] = [];
  switch (opportunity.availability_status) {
    case "open":
      reasons.push("Le programme accepte actuellement des demandes.");
      return { fraction: 1, reasons, concerns };
    case "continuous":
      reasons.push("Le programme est en dépôt continu.");
      return { fraction: 1, reasons, concerns };
    case "opening_soon":
      reasons.push(opportunity.expected_open_date ? `Le programme ouvre bientôt (${opportunity.expected_open_date}) : à préparer dès maintenant.` : "Le programme ouvre bientôt : à préparer dès maintenant.");
      return { fraction: 0.8, reasons, concerns };
    case "closed":
      concerns.push("Ce programme est actuellement fermé — à surveiller pour une prochaine ouverture plutôt qu’à déposer maintenant.");
      return { fraction: 0.15, reasons, concerns };
    default:
      concerns.push("Statut d’ouverture du programme non confirmé sur la source officielle.");
      return { fraction: 0.4, reasons, concerns };
  }
}

function scorePriorities(signals: ProjectSignals, opportunity: OpportunityForMatch) {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const priorities = opportunity.government_priorities ?? [];
  if (!priorities.length) {
    concerns.push("Aucune priorité gouvernementale n’a encore été extraite pour ce programme.");
    return { fraction: 0.4, reasons, concerns };
  }
  const normalizedIntents = signals.intentGroups.map((g) => normalizeSearchText(g));
  const matched = priorities.filter((priority) => {
    const normalizedPriority = normalizeSearchText(priority);
    return normalizedIntents.some((intent) => normalizedPriority.includes(intent) || intent.includes(normalizedPriority));
  });
  if (matched.length) {
    reasons.push(`Le projet touche à une priorité affichée par ce programme : ${matched.join(", ")}.`);
    return { fraction: 1, reasons, concerns };
  }
  return { fraction: 0.5, reasons, concerns }; // les priorités existent mais ne recoupent pas le projet : neutre, pas disqualifiant
}

function scoreSimilarAwards(signals: ProjectSignals, awards: FundingAwardForMatch[]) {
  const reasons: string[] = [];
  const concerns: string[] = [];
  if (!awards.length) {
    return { fraction: 0.5, reasons, concerns, matches: [] as FundingAwardForMatch[] }; // neutre : pas tous les programmes ont cette donnée
  }
  const intentTokens = new Set(signals.intentGroups.map((g) => normalizeSearchText(g).split(" ")).flat().filter((t) => t.length >= 4));
  const scored = awards
    .map((award) => {
      const text = normalizeSearchText(`${award.project_title ?? ""} ${award.description ?? ""}`);
      const hits = [...intentTokens].filter((t) => text.includes(t)).length;
      return { award, hits };
    })
    .sort((a, b) => b.hits - a.hits);
  const matches = scored.filter((s) => s.hits > 0).map((s) => s.award).slice(0, 3);
  if (matches.length) {
    reasons.push(`${matches.length} projet(s) de nature similaire ont déjà été financés par ce programme.`);
    return { fraction: 1, reasons, concerns, matches };
  }
  return { fraction: 0.5, reasons, concerns, matches: [] };
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

// Pondération explicite : la somme fait 100, chaque facteur est documenté ci-dessus.
// Volontairement PAS calibrée sur des acceptations réelles (Apex n'a pas cette donnée) —
// c'est un score de pertinence construit à partir de règles lisibles, pas un modèle prédictif.
const WEIGHTS = {
  thematic: 30,
  territory: 15,
  financial: 20,
  availability: 10,
  priorities: 15,
  awards: 10,
};

export function scoreOpportunityForProject(
  signals: ProjectSignals,
  opportunity: OpportunityForMatch,
  awards: FundingAwardForMatch[] = [],
): ProjectMatchResult {
  const thematic = scoreThematicFit(signals, opportunity);
  const territory = scoreTerritory(signals, opportunity);
  const financial = scoreFinancialFit(signals, opportunity);
  const availability = scoreAvailability(opportunity);
  const priorities = scorePriorities(signals, opportunity);
  const awardsResult = scoreSimilarAwards(signals, awards);

  const score = Math.round(
    thematic.fraction * WEIGHTS.thematic +
      territory.fraction * WEIGHTS.territory +
      financial.fraction * WEIGHTS.financial +
      availability.fraction * WEIGHTS.availability +
      priorities.fraction * WEIGHTS.priorities +
      awardsResult.fraction * WEIGHTS.awards,
  );

  const priorityLabel: ProjectMatchResult["priorityLabel"] = score >= 65 ? "Prioritaire" : score >= 35 ? "À évaluer" : "Pertinence faible";

  const deadlineStatus =
    opportunity.availability_status === "opening_soon"
      ? `Ouverture prévue${opportunity.expected_open_date ? ` le ${opportunity.expected_open_date}` : ""}`
      : opportunity.deadline
        ? `Échéance le ${opportunity.deadline}`
        : opportunity.availability_status === "continuous"
          ? "En continu"
          : "À confirmer";

  return {
    score: Math.max(0, Math.min(100, score)),
    priorityLabel,
    reasons: [...thematic.reasons, ...territory.reasons, ...financial.reasons, ...availability.reasons, ...priorities.reasons, ...awardsResult.reasons],
    criteriaToVerify: [...thematic.concerns, ...territory.concerns, ...financial.concerns, ...availability.concerns, ...priorities.concerns, ...awardsResult.concerns],
    potentialAmount: opportunity.max_amount ?? null,
    potentialRate: opportunity.funding_rate_max ?? null,
    deadlineStatus,
    similarAwards: awardsResult.matches,
  };
}
