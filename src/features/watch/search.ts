export type SearchableFundingOpportunity = {
  title?: string | null;
  summary?: string | null;
  organization?: string | null;
  categories?: string[] | null;
  eligible_sectors?: string[] | null;
  eligible_expenses?: string[] | null;
  eligibility_criteria?: string | null;
  raw_content?: string | null;
  funding_type?: string | null;
  search_aliases?: string[] | null;
};

export function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "nous", "notre", "nos", "une", "des", "les", "pour", "avec", "dans", "sur", "qui", "que",
  "est", "sont", "veux", "voulons", "projet", "entreprise", "entreprises", "faire", "afin", "plus",
  "par", "aux", "du", "de", "la", "le", "et", "un", "au", "en", "mon", "ma", "mes", "je",
  "cherche", "recherche", "trouver", "aide", "aides", "subvention", "subventions",
]);

// Chaque groupe représente une même intention métier. Le moteur ne dépend donc pas
// de l'emploi du mot exact utilisé par la source (ex. stage vs WIL vs stagiaire).
const SYNONYM_GROUPS: string[][] = [
  ["stage", "stages", "stagiaire", "stagiaires", "internship", "intern", "placement", "placements", "wil", "coop", "co op", "etudiant", "etudiante", "etudiants", "etudiantes", "student", "students", "career ready", "pratique rh", "pratiques rh"],
  ["formation", "formations", "former", "competence", "competences", "mfor", "main oeuvre", "developpement competences", "upskilling", "reskilling"],
  ["embauche", "recrutement", "recruter", "emploi", "emplois", "salarial", "salaire", "salaires", "subvention salariale", "wage subsidy"],
  ["crm", "erp", "logiciel", "logiciels", "numerique", "digital", "digitalisation", "transformation numerique", "technologie", "technologies", "automatisation"],
  ["export", "exportation", "salon commercial", "salons commerciaux", "foire commerciale", "mission commerciale", "commercialisation", "international", "internationalisation", "hors quebec", "marche etranger", "marches etrangers"],
  ["innovation", "recherche", "developpement", "rd", "r d", "r&d", "technologique", "pari", "irap"],
  ["environnement", "environnemental", "environnementale", "vert", "verte", "ecologique", "eco canada", "ecocanada", "cleantech", "transition energetique"],
  // Ajoutés le 18 sept. 2026 : ces univers n'avaient aucun groupe de synonymes (recherche
  // "IA", "cybersécurité", "défense" ou "manufacturier" ne retombait alors que sur la
  // correspondance de mots bruts, sans expansion). "ia" est un token court volontairement
  // inclus malgré le risque de faux positifs par sous-chaîne, comme "rd" l'est déjà pour
  // le groupe innovation ci-dessus.
  ["intelligence artificielle", "ia", "machine learning", "apprentissage automatique", "apprentissage machine", "algorithme", "algorithmes", "donnees massives", "big data"],
  ["cybersecurite", "cyber securite", "securite informatique", "securite des donnees", "protection des donnees", "cyberattaque", "cyberattaques", "cybersecurity"],
  ["defense", "double usage", "dual use", "securite nationale", "technologies militaires", "defence"],
  ["manufacturier", "manufacturiere", "manufacturiers", "manufacturieres", "usine", "usines", "production", "chaine de production", "automatisation industrielle", "robotique", "robotisation", "industrie 4 0"],
  // Ajoutés le 20 sept. 2026 : aucune des recherches « événement / festival / salon » ne trouvait de vocabulaire.
  ["evenement", "evenements", "evenementiel", "evenementielle", "festival", "festivals", "congres", "colloque", "conference", "conferences", "tournoi", "tournois", "gala", "manifestation", "manifestations", "spectacle", "spectacles", "fete", "fetes", "event", "events"],
  ["tourisme", "touristique", "touristiques", "attraction touristique", "culture", "culturel", "culturelle", "culturels", "artistique", "artistiques", "arts", "patrimoine", "musee", "musees", "creation artistique"],
];

// Étiquette lisible par univers, alignée sur l'ordre de SYNONYM_GROUPS ci-dessus.
// Sert à afficher à l'utilisateur QUELS univers son texte a déclenchés (ex. dans
// "Parle-moi de ton projet"), plutôt que la liste brute et peu lisible des tokens
// étendus que renvoie expandedSearchTerms().
const GROUP_LABELS = [
  "Stage / emploi étudiant",
  "Formation de la main-d’œuvre",
  "Embauche / subvention salariale",
  "Transformation numérique",
  "Export / international",
  "Innovation / R-D",
  "Environnement / technologies propres",
  "Intelligence artificielle",
  "Cybersécurité",
  "Défense / double usage",
  "Manufacturier / automatisation",
  "Événement / festival",
  "Tourisme / culture",
];

/** Univers métiers (groupes de synonymes) déclenchés par un texte libre. */
export function matchedIntentGroups(query: string): string[] {
  const normalizedQuery = normalizeSearchText(query);
  const base = baseTokens(query);
  const labels: string[] = [];
  SYNONYM_GROUPS.forEach((group, index) => {
    const normalizedGroup = group.map(normalizeSearchText);
    const groupMatches = normalizedGroup.some((term) =>
      normalizedQuery.includes(term) || base.some((token) => term.includes(token) || token.includes(term)),
    );
    if (groupMatches) labels.push(GROUP_LABELS[index] ?? group[0] ?? "");
  });
  return labels.filter(Boolean);
}

/**
 * Variante STRICTE de matchedIntentGroups : un terme doit apparaître comme mot entier (ou
 * comme début d'un mot d'au moins 5 lettres : « export » -> « exporter »). Évite les faux
 * positifs de sous-chaîne des tokens courts (« ia » dans « stagiaires » ou « commercialisation »).
 * Sert à décider si un programme est réellement du même univers qu'un besoin (features/programs/match.ts) ;
 * la recherche de la veille continue d'utiliser la version large ci-dessus.
 */
export function matchedIntentGroupsStrict(query: string): string[] {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  const padded = ` ${words.join(" ")} `;
  const labels: string[] = [];
  SYNONYM_GROUPS.forEach((group, index) => {
    const hit = group.map(normalizeSearchText).some((term) => {
      if (!term) return false;
      if (term.includes(" ")) return padded.includes(` ${term} `);
      return words.some((w) => w === term || (term.length >= 5 && w.startsWith(term)));
    });
    if (hit) labels.push(GROUP_LABELS[index] ?? group[0] ?? "");
  });
  return labels.filter(Boolean);
}

const FUNDING_TYPE_ALIASES: Record<string, string[]> = {
  internship: ["stage", "stagiaire", "etudiant", "placement", "wil", "coop", "internship"],
  wage_subsidy: ["embauche", "emploi", "salaire", "subvention salariale", "wage subsidy"],
  grant: ["subvention", "aide financiere", "grant"],
  contribution: ["contribution", "non remboursable"],
  tax_credit: ["credit impot", "credit fiscal", "tax credit"],
  tax_incentive: ["incitatif fiscal", "fiscalite", "tax incentive"],
  loan: ["pret", "loan"],
  financing: ["financement", "financing"],
  call_for_projects: ["appel projet", "appel projets", "appel propositions"],
};

function simpleStem(word: string) {
  if (word.length > 6 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 5 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function baseTokens(text: string) {
  return normalizeSearchText(text)
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

export function expandedSearchTerms(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const base = baseTokens(query);
  const terms = new Set<string>();

  for (const token of base) {
    terms.add(token);
    terms.add(simpleStem(token));
  }

  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map(normalizeSearchText);
    const groupMatches = normalizedGroup.some((term) =>
      normalizedQuery.includes(term) || base.some((token) => term.includes(token) || token.includes(term)),
    );
    if (groupMatches) {
      for (const term of normalizedGroup) {
        terms.add(term);
        for (const token of term.split(" ")) {
          if (token.length >= 2) terms.add(simpleStem(token));
        }
      }
    }
  }

  return Array.from(terms).filter(Boolean);
}

function buildSearchDocument(item: SearchableFundingOpportunity) {
  const fundingAliases = item.funding_type ? FUNDING_TYPE_ALIASES[item.funding_type] ?? [] : [];
  const title = normalizeSearchText(item.title ?? "");
  const categories = normalizeSearchText((item.categories ?? []).join(" "));
  const aliases = normalizeSearchText([...(item.search_aliases ?? []), ...fundingAliases].join(" "));
  const body = normalizeSearchText([
    item.summary ?? "",
    item.organization ?? "",
    (item.eligible_sectors ?? []).join(" "),
    (item.eligible_expenses ?? []).join(" "),
    item.eligibility_criteria ?? "",
    item.raw_content ?? "",
  ].join(" "));
  return { title, categories, aliases, body, all: `${title} ${categories} ${aliases} ${body}` };
}

/**
 * Score lexical métier (0-100). Il est volontairement explicable et déterministe :
 * titre > alias/catégorie > corps. Ce n'est pas présenté comme un score IA.
 */
export function fundingSearchScore(query: string, item: SearchableFundingOpportunity) {
  if (!query.trim()) return 0;
  const terms = expandedSearchTerms(query);
  if (!terms.length) return 0;
  const doc = buildSearchDocument(item);
  let points = 0;
  let matched = 0;

  for (const term of terms) {
    const stem = simpleStem(term);
    if (term.length < 2) continue;
    let termPoints = 0;
    if (doc.title.includes(term) || (stem.length >= 3 && doc.title.includes(stem))) termPoints = 6;
    else if (doc.aliases.includes(term) || doc.categories.includes(term) || (stem.length >= 3 && (`${doc.aliases} ${doc.categories}`).includes(stem))) termPoints = 4;
    else if (doc.body.includes(term) || (stem.length >= 3 && doc.body.includes(stem))) termPoints = 2;
    if (termPoints > 0) {
      matched += 1;
      points += termPoints;
    }
  }

  if (!matched) return 0;
  // Bonus si plusieurs concepts saisis par l'utilisateur sont couverts.
  const coverage = matched / Math.max(terms.length, 1);
  return Math.min(100, Math.round(35 + points * 2.5 + coverage * 30));
}

export function fundingMatchesQuery(query: string, item: SearchableFundingOpportunity) {
  return !query.trim() || fundingSearchScore(query, item) > 0;
}
