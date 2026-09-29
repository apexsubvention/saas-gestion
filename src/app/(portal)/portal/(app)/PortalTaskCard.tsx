"use client";

// 0069 -- carte pour une tâche (table tasks) attribuée EXPLICITEMENT à ce compte portail (client
// visé, ou fournisseur inscrit visé -- voir SupplierDossierCard.tsx pour l'autre point d'entrée),
// affichée dans la même section « Tâches à faire » que DocumentRequestItem.tsx (document_requests,
// dans DossierCard.tsx) -- jamais de fichier à fournir ici, juste une case à cocher (même principe
// que PortalTaskDoneButton.tsx pour les demandes sans document).
import { useTransition } from "react";
import { markTaskDoneAction } from "./actions";
import type { PortalTaskView } from "@/server/services/portalDossiers.service";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA");
}

export function PortalTaskCard({ task }: { task: PortalTaskView }) {
  const [pending, startTransition] = useTransition();

  function markDone() {
    startTransition(async () => {
      await markTaskDoneAction(task.id);
    });
  }

  return (
    <div className="rounded-md border border-neutral-100 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-medium ${task.status === "done" ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{task.title}</span>
        {(task.priority === "urgent" || task.priority === "high") && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{task.priorityLabel}</span>
        )}
      </div>
      {task.description && <p className="mt-1 text-xs text-neutral-500">{task.description}</p>}
      {task.dueDate && <p className="mt-1 text-xs text-neutral-500">Échéance : {formatDate(task.dueDate)}</p>}
      {task.status !== "done" ? (
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
      ) : (
        <p className="mt-2 text-xs text-emerald-700">Fait.</p>
      )}
    </div>
  );
}
