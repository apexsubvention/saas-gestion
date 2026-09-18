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
