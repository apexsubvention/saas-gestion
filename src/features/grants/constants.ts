// Étiquettes françaises pour grant_projects.status (voir supabase/migrations/0034_grant_project_statuses.sql
// pour la contrainte check). Six statuts seulement, dans l'ordre normal d'un dossier ; « Approuvé —
// en attente de réclamation » est posé automatiquement quand l'entente est saisie.

export const GRANT_PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: "À rédiger",
  pending_approval: "En attente d'approbation",
  approved: "Approuvé",
  awaiting_claim: "Approuvé — en attente de réclamation",
  rejected: "Refusé",
  completed: "Complété",
};

export const GRANT_PROJECT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "draft",
  "pending_approval",
  "approved",
  "awaiting_claim",
  "rejected",
  "completed",
].map((value) => ({ value, label: GRANT_PROJECT_STATUS_LABELS[value] ?? value }));

// Dossiers « en cours » (tableau de bord) : tout sauf refusé / complété.
export const ACTIVE_GRANT_PROJECT_STATUSES = ["draft", "pending_approval", "approved", "awaiting_claim"];

// Anciens statuts (11 valeurs, avant 0034) -> nouveaux. Même règle que la migration : un dossier
// approuvé/actif avec une entente est « en attente de réclamation », sans entente « approuvé ».
export function normalizeGrantProjectStatus(status: string, opts: { hasAgreement?: boolean } = {}): string {
  switch (status) {
    case "prospect":
    case "qualifying":
    case "preparing":
      return "draft";
    case "submitted":
    case "under_review":
      return "pending_approval";
    case "approved":
    case "active":
    case "final_claim":
      return opts.hasAgreement ? "awaiting_claim" : "approved";
    case "cancelled":
      return "rejected";
    default:
      return status; // valeur déjà nouvelle (ou invalide : la contrainte de la base la refusera)
  }
}

// Couleur de badge par statut, regroupée par famille (en attente / positif / négatif).
export function grantProjectStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "approved":
      return "bg-indigo-50 text-indigo-700";
    case "awaiting_claim":
      return "bg-amber-50 text-amber-800";
    case "rejected":
      return "bg-red-50 text-red-700";
    case "pending_approval":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

// Étiquettes françaises pour claims.status (voir 0008_expenses_claims.sql pour la liste
// exhaustive de la contrainte check).
export const CLAIM_STATUS_LABELS: Record<string, string> = {
  planned: "Planifiée",
  preparing: "En préparation",
  missing_documents: "Documents manquants",
  ready: "Prête à déposer",
  submitted: "Déposée — en attente",
  under_review: "En analyse",
  approved: "Approuvée",
  paid: "Payée",
  rejected: "Refusée",
};

export const CLAIM_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "planned",
  "preparing",
  "missing_documents",
  "ready",
  "submitted",
  "under_review",
  "approved",
  "paid",
  "rejected",
].map((value) => ({ value, label: CLAIM_STATUS_LABELS[value] ?? value }));

export function claimStatusBadgeClass(status: string): string {
  switch (status) {
    case "paid":
    case "approved":
      return "bg-emerald-50 text-emerald-700";
    case "ready":
    case "submitted":
    case "under_review":
      return "bg-indigo-50 text-indigo-700";
    case "missing_documents":
      return "bg-amber-50 text-amber-800";
    case "rejected":
      return "bg-red-50 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

// Étiquettes françaises pour tasks.status/priority (voir 0006_suppliers_budget_tasks.sql).
export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  waiting_client: "Attente client",
  waiting_supplier: "Attente fournisseur",
  blocked: "Bloquée",
  done: "Terminée",
  cancelled: "Annulée",
};

export const TASK_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "todo",
  "in_progress",
  "waiting_client",
  "waiting_supplier",
  "blocked",
  "done",
  "cancelled",
].map((value) => ({ value, label: TASK_STATUS_LABELS[value] ?? value }));

export function taskStatusBadgeClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "bg-indigo-50 text-indigo-700";
    case "waiting_client":
    case "waiting_supplier":
    case "blocked":
      return "bg-amber-50 text-amber-800";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

// Étiquettes françaises pour milestones.type/status (voir 0005_agreements_milestones.sql).
// "Échéance" dans l'UI = une ligne de milestones. type='claim' correspond à une réclamation
// à venir mais PAS ENCORE un dossier de réclamation réel (voir claims) -- c'est une entrée
// d'échéancier, suggérée ou manuelle, qui précède la création du dossier.
export const MILESTONE_TYPE_LABELS: Record<string, string> = {
  claim: "Réclamation à venir",
  report: "Rapport",
  document: "Document",
  invoice: "Facture",
  payment_proof: "Preuve de paiement",
  project_end: "Fin de projet",
  eligibility_end: "Fin de la période d'admissibilité",
  client_followup: "Suivi client",
  supplier_followup: "Suivi fournisseur",
  other: "Autre",
};

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: "À venir",
  done: "Complétée",
  at_risk: "À risque",
  cancelled: "Annulée",
};

export const MILESTONE_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "pending",
  "at_risk",
  "done",
  "cancelled",
].map((value) => ({ value, label: MILESTONE_STATUS_LABELS[value] ?? value }));

export function milestoneStatusBadgeClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-50 text-emerald-700";
    case "at_risk":
      return "bg-amber-50 text-amber-800";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

// Étiquettes françaises pour documents.category (voir 0007_documents.sql pour la liste
// exhaustive). Sous-ensemble utile pour le formulaire d'upload sur un dossier de
// subvention -- toutes les valeurs de la contrainte check ne sont pas listées ici.
export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  agreement: "Convention",
  invoice: "Facture",
  payment_proof: "Preuve de paiement",
  claim_form: "Réclamation",
  application: "Demande",
  budget: "Budget",
  report: "Rapport",
  annex: "Annexe",
  other: "Autre",
};

export const DOCUMENT_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  "agreement",
  "invoice",
  "payment_proof",
  "claim_form",
  "application",
  "budget",
  "report",
  "annex",
  "other",
].map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] ?? value }));

// Étiquettes françaises pour claim_requirements.status (voir 0008_expenses_claims.sql).
// Utilisées par le portail (« documents à fournir » par réclamation) et pourront l'être
// côté interne si une UI dédiée est ajoutée plus tard.
export const CLAIM_REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  missing: "Manquant",
  requested: "Demandé",
  received: "Reçu — à valider",
  validated: "Validé",
  not_required: "Non requis",
  issue: "Problème",
};

export function claimRequirementStatusBadgeClass(status: string): string {
  switch (status) {
    case "validated":
      return "bg-emerald-50 text-emerald-700";
    case "received":
      return "bg-indigo-50 text-indigo-700";
    case "requested":
      return "bg-amber-50 text-amber-800";
    case "issue":
      return "bg-red-50 text-red-700";
    case "not_required":
      return "bg-neutral-100 text-neutral-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

// Étiquettes françaises pour document_requests.status (voir 0009_document_requests_links.sql).
// Mêmes statuts que claim_requirements sauf le premier ("not_requested" plutôt que
// "missing") : ensembles distincts, labels distincts.
export const DOCUMENT_REQUEST_STATUS_LABELS: Record<string, string> = {
  not_requested: "Non demandé",
  requested: "Demandé",
  received: "Reçu — à valider",
  validated: "Validé",
  not_required: "Non requis",
  issue: "Problème",
};

export const DOCUMENT_REQUEST_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "requested",
  "received",
  "validated",
  "issue",
  "not_required",
].map((value) => ({ value, label: DOCUMENT_REQUEST_STATUS_LABELS[value] ?? value }));

export function documentRequestStatusBadgeClass(status: string): string {
  switch (status) {
    case "validated":
      return "bg-emerald-50 text-emerald-700";
    case "received":
      return "bg-indigo-50 text-indigo-700";
    case "requested":
      return "bg-amber-50 text-amber-800";
    case "issue":
      return "bg-red-50 text-red-700";
    case "not_required":
      return "bg-neutral-100 text-neutral-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

// Étiquettes/couleurs pour les seaux d'urgence de l'échéancier (voir
// src/features/schedule/priority.ts) -- utilisées par les vues Priorités et Kanban.
export const PRIORITY_BUCKET_LABELS: Record<string, string> = {
  overdue: "En retard",
  this_week: "Cette semaine",
  next_2_weeks: "Dans 2 semaines",
  this_month: "Ce mois-ci",
  later: "Plus tard",
  no_date: "Sans date",
  done: "Terminé",
};

export function priorityBucketBadgeClass(bucket: string): string {
  switch (bucket) {
    case "overdue":
      return "bg-red-50 text-red-700";
    case "this_week":
      return "bg-orange-50 text-orange-800";
    case "next_2_weeks":
      return "bg-amber-50 text-amber-800";
    case "this_month":
      return "bg-blue-50 text-blue-700";
    case "done":
      return "bg-emerald-50 text-emerald-700";
    case "no_date":
      return "bg-neutral-100 text-neutral-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
