// Date limite de paiement/facturation (Jade) : la convention précise parfois une règle
// différente de la simple fin de projet -- soit une date fixe précise, soit un délai en
// jours après la fin du projet (ex. « le paiement peut être effectué jusqu'à 90 jours après
// la fin du projet »). Si rien n'est indiqué, la règle par défaut est : tout doit être payé
// et facturé d'ici la fin du projet elle-même.
//
// Fonction pure (aucune dépendance Supabase), comme billingSummary.ts : la convention ne
// fait QUE fournir les faits bruts (date exacte OU nombre de jours) -- jamais de calcul fait
// par l'IA elle-même (cf. analyzeConvention.ts) -- tout le calcul de date se fait ici, en
// TypeScript déterministe.
export type PaymentDeadlineInput = {
  projectEnd: string | null; // ISO (déjà résolu : agreement.project_end ?? official_end_date)
  paymentDeadlineDate: string | null; // date fixe lue dans la convention, si présente
  paymentDeadlineDaysAfterEnd: number | null; // délai en jours lu dans la convention, si présent
};

export type PaymentDeadlineRule = "fixed_date" | "grace_period" | "project_end" | "unknown";

export type PaymentDeadlineResult = {
  date: string | null; // date limite effective (ISO), null si rien n'est calculable
  rule: PaymentDeadlineRule;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Priorité : date fixe explicite > délai en jours après la fin du projet > fin du projet
 * elle-même (règle par défaut) > rien (aucune date de fin de projet connue).
 */
export function computePaymentDeadline(input: PaymentDeadlineInput): PaymentDeadlineResult {
  if (input.paymentDeadlineDate) {
    return { date: input.paymentDeadlineDate, rule: "fixed_date" };
  }
  if (input.projectEnd && input.paymentDeadlineDaysAfterEnd != null) {
    return { date: addDays(input.projectEnd, input.paymentDeadlineDaysAfterEnd), rule: "grace_period" };
  }
  if (input.projectEnd) {
    return { date: input.projectEnd, rule: "project_end" };
  }
  return { date: null, rule: "unknown" };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Texte de l'alerte affichée (admin ET portail, mêmes mots) -- explique TOUJOURS d'où vient
 * la date pour que ce ne soit jamais présenté comme une fin de projet inventée. Renvoie null
 * si aucune date n'est calculable (rien à afficher plutôt qu'une phrase vide).
 */
export function paymentDeadlineAlertText(result: PaymentDeadlineResult, days: number | null): string | null {
  if (!result.date) return null;
  const dateStr = formatDate(result.date);
  switch (result.rule) {
    case "fixed_date":
      return `La convention indique une date limite précise pour le paiement et la facturation : tout doit être payé et facturé d'ici le ${dateStr}.`;
    case "grace_period":
      return `Selon la convention, le paiement peut être effectué jusqu'à ${days} jours après la fin du projet : tout doit être payé et facturé d'ici le ${dateStr}.`;
    case "project_end":
      return `Aucune règle particulière n'a été trouvée dans la convention à ce sujet : par défaut, tout doit être payé et facturé d'ici la fin du projet, soit le ${dateStr}.`;
    default:
      return null;
  }
}
