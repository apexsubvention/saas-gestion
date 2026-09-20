// Suggestion (jamais création silencieuse) d'échéances de réclamation à partir des
// SEULES dates déjà présentes dans l'entente de convention (grant_agreements). Aucune
// donnée n'est inventée : on fait uniquement de l'arithmétique de dates sur des champs
// explicitement renseignés, et chaque résultat est étiqueté "estimée" dans son propre
// titre pour ne jamais être confondu avec une échéance officielle tirée du document.
//
// Pourquoi ne pas essayer d'extraire une échéance "officielle" depuis claim_frequency /
// special_conditions (texte libre) : la relecture des dossiers clients importés a montré
// des documents internes CONTRADICTOIRES sur les dates d'un même projet (voir le dossier
// Sitegrow / CanExport -- trois dates de projet différentes selon le document). Parser ce
// texte automatiquement produirait de fausses certitudes. Un humain doit lire l'entente et
// ajuster/supprimer ces suggestions au besoin.

export type MilestoneSuggestion = {
  type: "claim";
  title: string;
  internal_due_date: string; // YYYY-MM-DD
};

const FINAL_CLAIM_GRACE_DAYS = 60;

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function midpoint(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  const mid = new Date(start + (end - start) / 2);
  return mid.toISOString().slice(0, 10);
}

export function suggestMilestonesFromAgreement(agreement: {
  eligible_expense_period_start: string | null;
  eligible_expense_period_end: string | null;
  project_end: string | null;
}): MilestoneSuggestion[] {
  const start = agreement.eligible_expense_period_start;
  const end = agreement.eligible_expense_period_end ?? agreement.project_end;

  const suggestions: MilestoneSuggestion[] = [];

  if (start && end && start < end) {
    suggestions.push({
      type: "claim",
      title: "Réclamation mi-projet (estimée — à valider selon l'entente)",
      internal_due_date: midpoint(start, end),
    });
  }

  if (end) {
    suggestions.push({
      type: "claim",
      title: `Réclamation finale (estimée : fin de période + ${FINAL_CLAIM_GRACE_DAYS} jours — vérifier le délai exact dans l'entente)`,
      internal_due_date: addDays(end, FINAL_CLAIM_GRACE_DAYS),
    });
  }

  return suggestions;
}
