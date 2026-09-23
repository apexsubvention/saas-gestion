// Calendrier de facturation : découpe la durée du projet en N versements consécutifs (le versement 2
// commence toujours le lendemain de la fin du versement 1, etc.) et répartit le montant total des
// activités acceptées entre eux -- SANS jamais inventer de montant, seulement une répartition
// arithmétique du total déjà validé. Fonctions pures, sans dépendance Supabase -- mêmes principes que
// src/features/ddr/schedule.ts (utilisé à la fois pour la génération initiale et pour « ajuster les
// versements restants » quand le client ne facture pas au rythme prévu).

export type BillingPeriod = { installment_number: number; period_start: string; period_end: string };

const DAY_MS = 86_400_000;

function parseISO(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

// Découpe [rangeStart, rangeEnd] (inclusif) en `count` périodes consécutives, réparties aussi
// également que possible (recalculé à chaque étape pour éviter toute dérive d'arrondi), numérotées
// à partir de `startNumber`. La dernière période se termine toujours exactement à rangeEnd.
export function computeBillingPeriods(rangeStart: string, rangeEnd: string, count: number, startNumber = 1): BillingPeriod[] {
  if (count <= 0) return [];
  const start = parseISO(rangeStart);
  const end = parseISO(rangeEnd);
  if (end.getTime() < start.getTime()) return [];

  const periods: BillingPeriod[] = [];
  let cursor = start;
  for (let i = 0; i < count; i++) {
    const remainingPeriods = count - i;
    const remainingDays = Math.round((end.getTime() - cursor.getTime()) / DAY_MS) + 1;
    const isLast = i === count - 1;
    const days = isLast ? remainingDays : Math.max(1, Math.round(remainingDays / remainingPeriods));
    const periodEnd = isLast ? end : addDays(cursor, days - 1);
    periods.push({ installment_number: startNumber + i, period_start: toISO(cursor), period_end: toISO(periodEnd) });
    cursor = addDays(periodEnd, 1);
  }
  return periods;
}

// Répartit un montant total (en dollars) en `count` parts aussi égales que possible, au cent près,
// sans perte ni surplus d'arrondi (le dernier versement absorbe le reliquat de centimes). Le montant
// n'est JAMAIS recalculé ou déduit par l'IA -- seulement réparti mécaniquement ici, puis librement
// modifiable ensuite versement par versement.
export function splitAmountEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;
  return Array.from({ length: count }, (_, i) => {
    const cents = baseCents + (i < remainder ? 1 : 0);
    return cents / 100;
  });
}

// Nombre de versements « par défaut » suggéré à partir de la fréquence de réclamation lue dans
// l'entente (ex. « mensuelle », « trimestrielle »), sinon 1 (aucune supposition sans indication).
export function suggestInstallmentCount(projectStart: string, projectEnd: string, claimFrequency: string | null): number {
  const start = parseISO(projectStart);
  const end = parseISO(projectEnd);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days <= 0) return 1;

  const freq = (claimFrequency ?? "").toLowerCase();
  let periodDays: number | null = null;
  if (/mensuel/.test(freq)) periodDays = 30.4;
  else if (/trimestriel/.test(freq)) periodDays = 91.3;
  else if (/semestriel/.test(freq)) periodDays = 182.6;
  else if (/annuel/.test(freq)) periodDays = 365.25;

  if (periodDays == null) return 1;
  return Math.max(1, Math.round(days / periodDays));
}
