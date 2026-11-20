// Forfaits Sitegrow (offre de services SEO & GEO) -- Jade : pour les clients ENFANTS de Sitegrow
// (souvent subventionnés par MFOR), le calendrier de versements suit le forfait réellement signé
// avec Sitegrow plutôt qu'une simple division égale du total.
//
// Règles (Jade, 2026-11-20) -- ex. forfait signé 2 500 $/mois, subvention 15 000 $, 5 mois :
// - Suggestion 1, même forfait avec balance à la fin : une facture par mois au prix du forfait,
//   la dernière reprend tout le solde de la subvention → 4 × 2 500 $ + 5 000 $.
// - Suggestion 2, forfait supérieur (vu que c'est subventionné) : même règle avec le prix du
//   forfait au-dessus, au même palier d'engagement → 4 × 3 500 $ + 1 000 $.
// - Le total facturé = toujours exactement le total à facturer (subvention), jamais plus.
// - Si la subvention ne couvre pas tous les mois au prix du forfait, il y a moins de factures
//   (ex. 10 000 $ à 3 500 $/mois → 2 × 3 500 $ + 3 000 $).
// Grille fixe, telle que dans l'offre Sitegrow (prix mensuels, CAD, avant taxes) -- à mettre à
// jour ici si Sitegrow change ses tarifs. Fonctions pures, utilisables serveur et client.

export type SitegrowLevel = "essentiel" | "optimisation" | "domination";
export type SitegrowTier = 3 | 6 | 12;

export const SITEGROW_LEVEL_LABELS: Record<SitegrowLevel, string> = {
  essentiel: "Forfait Essentiel",
  optimisation: "Forfait Optimisation",
  domination: "Forfait Domination",
};

export const SITEGROW_MONTHLY_PRICES: Record<SitegrowLevel, Record<SitegrowTier, number>> = {
  essentiel: { 3: 2500, 6: 2300, 12: 2000 },
  optimisation: { 3: 3500, 6: 3300, 12: 3000 },
  domination: { 3: 4500, 6: 4300, 12: 4000 },
};

export const SITEGROW_LEVELS: SitegrowLevel[] = ["essentiel", "optimisation", "domination"];
export const SITEGROW_TIERS: SitegrowTier[] = [3, 6, 12];

export type SitegrowPlan = {
  level: SitegrowLevel;
  tier: SitegrowTier;
  monthlyPrice: number;
  amounts: number[]; // une facture par mois ; la dernière = solde de la subvention
  balance: number; // montant de la dernière facture (solde)
  total: number; // = budget
};

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function parseISO(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Même jour du mois, `offset` mois plus tard, ramené au dernier jour si le mois est plus court
// (ex. 31 janv. + 1 mois → 28 févr., jamais 3 mars).
function sameDayInMonth(start: Date, offset: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + offset;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

/** Nombre de mois (arrondi) couverts par le projet, au moins 1. */
export function projectMonths(projectStart: string, projectEnd: string): number {
  const days = Math.round((parseISO(projectEnd).getTime() - parseISO(projectStart).getTime()) / DAY_MS) + 1;
  if (days <= 0) return 1;
  return Math.max(1, Math.round(days / 30.44));
}

/** Palier de prix le plus proche d'une durée d'engagement (1-5 → 3 ; 6-11 → 6 ; 12+ → 12). */
export function sitegrowTierForMonths(months: number): SitegrowTier {
  if (months >= 12) return 12;
  if (months >= 6) return 6;
  return 3;
}

/**
 * Factures mensuelles au prix du forfait, la dernière absorbant le solde : au plus `maxMonths`
 * factures, total = budget exactement.
 */
export function balancedAmounts(monthlyPrice: number, budget: number, maxMonths: number): number[] {
  if (!(budget > 0) || !(monthlyPrice > 0) || maxMonths < 1) return [];
  const full = Math.min(maxMonths - 1, Math.floor((budget + 0.005) / monthlyPrice));
  const amounts = Array.from({ length: full }, () => monthlyPrice);
  const rest = round2(budget - full * monthlyPrice);
  if (rest > 0.005) amounts.push(rest);
  return amounts;
}

export function buildSitegrowPlan(level: SitegrowLevel, tier: SitegrowTier, budget: number, maxMonths: number, monthlyPrice?: number): SitegrowPlan {
  const price = monthlyPrice && monthlyPrice > 0 ? monthlyPrice : SITEGROW_MONTHLY_PRICES[level][tier];
  const amounts = balancedAmounts(price, budget, maxMonths);
  return { level, tier, monthlyPrice: price, amounts, balance: amounts[amounts.length - 1] ?? 0, total: round2(amounts.reduce((s, a) => s + a, 0)) };
}

/** Forfait juste au-dessus (null si déjà Domination). */
export function nextSitegrowLevel(level: SitegrowLevel): SitegrowLevel | null {
  const i = SITEGROW_LEVELS.indexOf(level);
  return SITEGROW_LEVELS[i + 1] ?? null;
}

/** Forfait signé le plus probable quand on ne le connaît pas : prix × mois le plus proche du budget. */
export function guessSignedSitegrowLevel(budget: number, maxMonths: number, tier: SitegrowTier): SitegrowLevel {
  let best: SitegrowLevel = "essentiel";
  let bestGap = Infinity;
  for (const level of SITEGROW_LEVELS) {
    const gap = Math.abs(SITEGROW_MONTHLY_PRICES[level][tier] * maxMonths - budget);
    if (gap < bestGap - 0.005) {
      best = level;
      bestGap = gap;
    }
  }
  return best;
}

/** Libellé court du programme (« MFOR » si le nom le contient). */
export function programShortLabel(programName: string | null | undefined): string {
  if (/mfor/i.test(programName ?? "")) return "MFOR";
  return programName?.trim() || "la subvention";
}

const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

/** Phrase prête à envoyer au client, ex. « 4 factures de 2 500 $ et une 5e de 5 000 $ ». */
export function describeSitegrowPlan(plan: SitegrowPlan, programLabel: string): string {
  const n = plan.amounts.length;
  const head = `${SITEGROW_LEVEL_LABELS[plan.level]} à ${money(plan.monthlyPrice)}/mois`;
  if (n === 0) return `${head} : aucun montant à facturer.`;
  const fullCount = plan.amounts.filter((a) => Math.abs(a - plan.monthlyPrice) < 0.005).length;
  const lastIsBalance = Math.abs(plan.balance - plan.monthlyPrice) >= 0.005;
  let detail: string;
  if (!lastIsBalance) detail = n === 1 ? `1 facture de ${money(plan.monthlyPrice)}` : `${n} factures de ${money(plan.monthlyPrice)}`;
  else if (fullCount === 0) detail = `1 facture de ${money(plan.balance)}`;
  else detail = `${fullCount} facture${fullCount > 1 ? "s" : ""} de ${money(plan.monthlyPrice)} et une ${n}e de ${money(plan.balance)} (solde)`;
  return `${head} : ${detail}, pour un total de ${money(plan.total)} couvert par ${programLabel}.`;
}

/**
 * Périodes mensuelles consécutives à partir du début du projet (ex. 21 sept → 20 oct, 21 oct →
 * 20 nov…). La dernière ne dépasse jamais la fin du projet, et s'y termine quand on facture tous
 * les mois du projet.
 */
export function sitegrowMonthlyPeriods(projectStart: string, projectEnd: string, months: number) {
  const start = parseISO(projectStart);
  const end = parseISO(projectEnd);
  const maxMonths = projectMonths(projectStart, projectEnd);
  const periods: { installment_number: number; period_start: string; period_end: string }[] = [];
  for (let i = 0; i < months; i++) {
    const pStart = sameDayInMonth(start, i);
    let pEnd = new Date(sameDayInMonth(start, i + 1).getTime() - DAY_MS);
    const isLast = i === months - 1;
    if (pEnd.getTime() > end.getTime() || (isLast && months >= maxMonths)) pEnd = end;
    if (pStart.getTime() > end.getTime()) break;
    periods.push({ installment_number: i + 1, period_start: toISO(pStart), period_end: toISO(pEnd) });
  }
  return periods;
}

/** Repère un client enfant de Sitegrow (ou un dossier dont un fournisseur est Sitegrow). */
export function isSitegrowName(name: string | null | undefined): boolean {
  return /site\s*grow/i.test(name ?? "");
}
