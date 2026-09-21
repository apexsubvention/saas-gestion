"use client";

import { useState, useTransition } from "react";
import { deleteScheduleItemAction } from "./scheduleActions";

// Suppression définitive d'une tâche, d'une échéance ou d'une réclamation. Le texte de confirmation est
// fourni par le serveur : il dit précisément ce qui sera retiré et ce qui est conservé.
export function DeleteScheduleItemButton({
  grantProjectId,
  kind,
  id,
  confirmText,
}: {
  grantProjectId: string;
  kind: "task" | "milestone" | "claim";
  id: string;
  confirmText: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteScheduleItemAction(grantProjectId, kind, id);
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
