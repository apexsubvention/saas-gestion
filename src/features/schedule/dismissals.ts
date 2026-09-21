// Éléments d'échéancier créés AUTOMATIQUEMENT (réclamations mensuelles « DDR », échéances suggérées à partir
// de l'entente). Quand l'utilisateur en supprime un, on retient sa clé pour que le générateur ne le recrée pas
// au prochain enregistrement de l'entente (table schedule_dismissals, migration 0040).

// Même clé que celle utilisée pour dédoublonner les suggestions : deux réclamations « claim » distinctes
// (mi-projet, finale) se distinguent par le titre ; les autres types n'existent qu'une fois par entente.
export function milestoneDedupeKey(type: string, title: string): string {
  return type === "claim" ? `claim:${title}` : `type:${type}`;
}

export function isAutoMilestone(source: string): boolean {
  return source === "ai_proposed";
}

// Numéro généré par buildMonthlyClaims : « DDR 2026-03 ».
const AUTO_CLAIM = /^DDR \d{4}-\d{2}$/;
export function isAutoClaimNumber(claimNumber: string | null | undefined): claimNumber is string {
  return !!claimNumber && AUTO_CLAIM.test(claimNumber);
}

export const MILESTONE_TYPE_LABELS: Record<string, string> = {
  claim: "Dépôt d'une réclamation",
  report: "Rapport",
  document: "Document à fournir",
  invoice: "Facture",
  payment_proof: "Preuve de paiement",
  project_end: "Fin de projet",
  client_followup: "Suivi client",
  supplier_followup: "Suivi fournisseur",
  other: "Autre",
};
