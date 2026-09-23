"use client";

// Bouton de suppression d'une tâche, utilisable depuis n'importe quelle vue de l'échéancier
// global (Priorités/Kanban/Liste). Réservé aux tâches (kind === "task") -- voir deleteGlobalTaskAction.
import { useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteGlobalTaskAction } from "./actions";

export function DeleteTaskButton({ taskId, title, className }: { taskId: string; title: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Supprimer la tâche « ${title} » ?`)) return;
    startTransition(async () => {
      const r = await deleteGlobalTaskAction(taskId);
      if (r.error) alert(r.error);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Supprimer cette tâche"
      className={className ?? "text-[11px] font-medium text-red-600 underline disabled:opacity-50"}
    >
      {pending ? "…" : "Supprimer"}
    </button>
  );
}
