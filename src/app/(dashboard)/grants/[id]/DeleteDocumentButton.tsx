"use client";

// Suppression définitive d'un document (ligne + fichier Storage, voir documentsService.remove).
// Réservée aux admins par RLS (documents_delete, apex_documents_delete -- 0016/0019) : un membre
// employé verra l'erreur RLS s'afficher ici plutôt qu'une suppression silencieuse. Même idiome
// que DeleteScheduleItemButton (confirm() navigateur, pas d'état "removed" local -- la ligne
// disparaît d'elle-même via revalidatePath une fois l'action terminée).
import { useState, useTransition } from "react";
import { deleteDocumentAction } from "./actions";

export function DeleteDocumentButton({
  grantProjectId,
  documentId,
  storagePath,
  filename,
}: {
  grantProjectId: string;
  documentId: string;
  storagePath: string;
  filename: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm(`Supprimer définitivement « ${filename} » ? Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteDocumentAction(grantProjectId, documentId, storagePath);
      if (r.error) setError(r.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={remove} className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50" title="Supprimer définitivement">
        {pending ? "Suppression…" : "Supprimer"}
      </button>
      {error && <span className="max-w-[220px] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
