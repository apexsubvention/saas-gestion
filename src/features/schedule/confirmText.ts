// Texte de confirmation avant de supprimer une tâche, une échéance ou une réclamation : dit précisément ce qui
// sera retiré, ce qui est conservé, et si l'élément sera recréé automatiquement.

const PROCESSED_CLAIM = new Set(["submitted", "under_review", "approved", "paid"]);

export function deleteConfirmText(
  kind: "task" | "milestone" | "claim",
  item: { title: string; status?: string; statusLabel?: string; auto?: boolean }
): string {
  if (kind === "task") return `Supprimer la tâche « ${item.title} » ? Cette action est définitive.`;

  if (kind === "milestone") {
    return `Supprimer l'échéance « ${item.title} » ?${item.auto ? " Elle ne sera pas recréée automatiquement quand tu modifies l'entente (« Suggérer l'échéancier » permet de la redemander)." : ""} Cette action est définitive.`;
  }

  const processed = item.status != null && PROCESSED_CLAIM.has(item.status);
  return (
    `Supprimer la réclamation « ${item.title} » ?` +
    (processed ? ` ⚠ Elle est déjà « ${item.statusLabel ?? item.status} » : son historique de réclamation sera perdu.` : "") +
    " Sa liste d'éléments manquants, ses demandes de documents et ses liens avec des factures seront retirés." +
    " Les documents téléversés, les factures et les tâches sont conservés (les tâches perdent seulement le lien)." +
    (item.auto ? " Elle ne sera pas recréée automatiquement quand tu modifies l'entente." : "") +
    " Cette action est définitive."
  );
}
