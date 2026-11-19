// Forfaits Sitegrow (offre de services SEO & GEO) -- Jade : pour les clients ENFANTS de Sitegrow
// (souvent subventionnés par MFOR), le calendrier de versements doit coller le plus possible au
// forfait réellement pris avec Sitegrow, plutôt qu'à une simple division égale du total.
//
// Règles (choisies par Jade) :
// - Grille fixe, telle que dans l'offre Sitegrow (prix mensuels, CAD, avant taxes). À mettre à jour
//   ici si Sitegrow change ses tarifs.
// - Palier de prix selon la durée : 1 à 5 mois → tarif « engagement 3 mois » ; 6 à 11 mois → tarif
//   « 6 mois » ; 12 mois et plus → tarif « 12 mois ».
// - Apex teste chaque forfait avec chaque nombre de mois possible dans la durée du projet et garde
//   la combinaison dont le total (prix mensuel × mois) est le plus proche du total à facturer.
//   Égalité : on préfère le total qui ne dépasse pas le budget, puis le plus de mois.
// Fonctions pures, sans Supabase -- utilisables côté serveur (génération) et client (aperçu).

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

export type SitegrowPlan = {
  level: SitegrowLevel;
  tier: SitegrowTier;
  months: number;
  monthlyPrice: number;
  total: number;
  gap: number; // total - budget (négatif = sous le budget)
};

const DAY_MS = 86_400_000;

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

/** Palier de prix selon le nombre de mois facturés. */
export function sitegrowTierForMonths(months: number): SitegrowTier {
  if (months >= 12) return 12;
  if (months >= 6) return 6;
  return 3;
}

/** Nombre de mois (arrondi) couverts par le projet, au moins 1. */
export function projectMonths(projectStart: string, projectEnd: string): number {
  const days = Math.round((parseISO(projectEnd).getTime() - parseISO(projectStart).getTime()) / DAY_MS) + 1;
  if (days <= 0) return 1;
  return Math.max(1, Math.round(days / 30.44));
}

export function buildSitegrowPlan(level: SitegrowLevel, months: number, budget: number): SitegrowPlan {
  const tier = sitegrowTierForMonths(months);
  const monthlyPrice = SITEGROW_MONTHLY_PRICES[level][tier];
  const total = monthlyPrice * months;
  return { level, tier, months, monthlyPrice, total, gap: Math.round((total - budget) * 100) / 100 };
}

/** Forfait + nombre de mois dont le total est le plus proche du budget, sans dépasser la durée du projet. */
export function chooseSitegrowPlan(budget: number, maxMonths: number): SitegrowPlan | null {
  if (!(budget > 0) || maxMonths < 1) return null;
  let best: SitegrowPlan | null = null;
  for (const level of SITEGROW_LEVELS) {
    for (let m = 1; m <= maxMonths; m++) {
      const plan = buildSitegrowPlan(level, m, budget);
      if (!best) {
        best = plan;
        continue;
      }
      const d = Math.abs(plan.gap);
      const bd = Math.abs(best.gap);
      if (d < bd - 0.005) best = plan;
      else if (Math.abs(d - bd) <= 0.005) {
        const underNow = plan.gap <= 0;
        const underBest = best.gap <= 0;
        if ((underNow && !underBest) || (underNow === underBest && plan.months > best.months)) best = plan;
      }
    }
  }
  return best;
}

/**
 * Périodes mensuelles consécutives à partir du début du projet (ex. 21 sept → 20 oct, 21 oct →
 * 20 nov…), comme la facturation Sitegrow « au début de chaque mois de service ». La dernière
 * période ne dépasse jamais la fin du projet, et s'y termine quand on facture tous les mois du projet.
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
