// Réclamations mensuelles (« DDR ») : certains programmes, dont PARI-CNRC, se réclament UNE FOIS PAR
// MOIS du début à la fin du projet. Ce module décide si un dossier suit ce régime et calcule les
// périodes ; il n'invente aucune donnée : périodes = mois calendaires entre les DEUX dates saisies
// dans l'entente (début et fin du projet), échéance = fin de période + un délai réglable.

const MAX_MONTHS = 60; // garde-fou contre une date de fin saisie par erreur (ex. année 2062)
export const DEFAULT_DUE_DELAY_DAYS = 15;

const MONTHLY_PROGRAM = /\b(pari|irap|cnrc|nrc)\b|conseil national de recherches/i;
const MONTHLY_TEXT = /mensuel|monthly|\bddr\b/i;
const OTHER_TEXT = /trimestr|quarter|semestr|annuel|annual|fin de projet|final/i;

/**
 * Le texte de fréquence saisi dans l'entente l'emporte ; à défaut, PARI-CNRC est mensuel.
 * « trimestrielle », « à la fin du projet »... -> régime standard (jamais mensuel).
 */
export function isMonthlyClaimProgram(programName: string | null | undefined, claimFrequencyText: string | null | undefined): boolean {
  const text = (claimFrequencyText ?? "").trim();
  if (text && OTHER_TEXT.test(text) && !MONTHLY_TEXT.test(text)) return false;
  if (text && MONTHLY_TEXT.test(text)) return true;
  return MONTHLY_PROGRAM.test(programName ?? "");
}

export type MonthlyClaim = {
  claim_number: string; // « DDR 2026-03 » : sert aussi de clé de dédoublonnage
  period_start: string; // AAAA-MM-JJ
  period_end: string;
  due_date: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildMonthlyClaims(startIso: string, endIso: string, dueDelayDays = DEFAULT_DUE_DELAY_DAYS): MonthlyClaim[] {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const out: MonthlyClaim[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  while (out.length < MAX_MONTHS) {
    const monthStart = new Date(Date.UTC(year, month, 1));
    if (monthStart > end) break;
    const monthEnd = new Date(Date.UTC(year, month + 1, 0)); // dernier jour du mois
    const periodStart = monthStart < start ? start : monthStart; // premier mois partiel
    const periodEnd = monthEnd > end ? end : monthEnd; //          dernier mois partiel
    const due = new Date(periodEnd);
    due.setUTCDate(due.getUTCDate() + dueDelayDays);
    out.push({
      claim_number: `DDR ${year}-${String(month + 1).padStart(2, "0")}`,
      period_start: iso(periodStart),
      period_end: iso(periodEnd),
      due_date: iso(due),
    });
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return out;
}
