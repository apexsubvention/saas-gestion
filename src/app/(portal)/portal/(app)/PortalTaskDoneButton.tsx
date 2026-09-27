"use client";

// Tâche demandée SANS document à téléverser (0067 -- Jade : « ce n'est pas chaque tâche
// demandée qui va devoir avoir un document à téléverser ») -- une simple case à cocher, à
// côté de DocumentRequestUpload.tsx (qui reste le formulaire de fichier pour les tâches où
// requiresUpload est resté à true).
import { useTransition } from "react";
import { markDocumentRequestDoneAction } from "./actions";

export function PortalTaskDoneButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();

  function markDone() {
    startTransition(async () => {
      await markDocumentRequestDoneAction(requestId);
    });
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
        <input
          type="checkbox"
          disabled={pending}
          onChange={(e) => {
            if (e.currentTarget.checked) markDone();
          }}
          className="h-4 w-4 rounded border-neutral-300"
        />
        {pending ? "Envoi..." : "Marquer comme fait"}
      </label>
    </div>
  );
}
