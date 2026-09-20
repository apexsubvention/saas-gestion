// Étiquettes françaises pour grant_projects.status (voir supabase/migrations/0003_grant_projects.sql
// pour la contrainte check qui définit la liste exhaustive des valeurs possibles).
// L'ordre ci-dessous reflète la progression normale d'un dossier, utilisé pour le <select>.

export const GRANT_PROJECT_STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  qualifying: "En qualification",
  preparing: "En préparation",
  submitted: "Déposé — en attente",
  under_review: "En attente (analyse par le bailleur)",
  approved: "Approuvé — en attente de réclamation",
  active: "Actif — projet en cours",
  final_claim: "Réclamation finale en cours",
  completed: "Complété",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export const GRANT_PROJECT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  "prospect",
  "qualifying",
  "preparing",
  "submitted",
  "under_review",
  "approved",
  "active",
  "final_claim",
  "completed",
  "rejected",
  "cancelled",
].map((value) => ({ value, label: GRANT_PROJECT_STATUS_LABELS[value] ?? value }));

// Couleur de badge par statut, regroupée par famille (en attente / positif / négatif).
export function grantProjectStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "active":
    case "approved":
      return "bg-indigo-50 text-indigo-700";
    case "final_claim":
      return "bg-amber-50 text-amber-800";
    case "rejected":
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "submitted":
    case "under_review":
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
};

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
