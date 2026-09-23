// Calendrier des DDR (demandes de remboursement PARI CNRC) : découpe la durée du projet en N
// périodes consécutives (la période 2 commence toujours le lendemain de la fin de la période 1,
// etc.), et propose un % d'avancement croissant par DDR pour les objectifs. Fonctions pures, sans
// dépendance Supabase -- testables et réutilisées à la fois pour la génération initiale et pour
// « régénérer les DDR restants » quand le rythme réel diffère (l'entreprise ne dépose pas chaque mois).

export type DdrPeriod = { ddr_number: number; period_start: string; period_end: string };

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
export function computeDdrPeriods(rangeStart: string, rangeEnd: string, count: number, startNumber = 1): DdrPeriod[] {
  if (count <= 0) return [];
  const start = parseISO(rangeStart);
  const end = parseISO(rangeEnd);
  if (end.getTime() < start.getTime()) return [];

  const periods: DdrPeriod[] = [];
  let cursor = start;
  for (let i = 0; i < count; i++) {
    const remainingPeriods = count - i;
    const remainingDays = Math.round((end.getTime() - cursor.getTime()) / DAY_MS) + 1;
    const isLast = i === count - 1;
    const days = isLast ? remainingDays : Math.max(1, Math.round(remainingDays / remainingPeriods));
    const periodEnd = isLast ? end : addDays(cursor, days - 1);
    periods.push({ ddr_number: startNumber + i, period_start: toISO(cursor), period_end: toISO(periodEnd) });
    cursor = addDays(periodEnd, 1);
  }
  return periods;
}

// Nombre de DDR « par défaut » pour un projet : environ un par mois entamé, minimum 1.
export function defaultDdrCount(projectStart: string, projectEnd: string): number {
  const start = parseISO(projectStart);
  const end = parseISO(projectEnd);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days <= 0) return 1;
  return Math.max(1, Math.round(days / 30.4));
}

// % d'avancement suggéré pour un objectif à ce DDR, sur une rampe partagée entre tous les objectifs
// (chacun reste ensuite modifiable indépendamment à la main sur chaque DDR). Ne prétend jamais à
// 100 % avant le dernier DDR du calendrier -- le projet n'est pas terminé avant.
export function suggestProgressPercent(ddrNumber: number, totalCount: number): number {
  const START = 15;
  const END = 95;
  if (totalCount <= 1) return END;
  const frac = (ddrNumber - 1) / (totalCount - 1);
  return Math.round(START + (END - START) * frac);
}
