"use client";

import { useTransition } from "react";
import { deleteMilestoneAction } from "./actions";

// Une suggestion (source = ai_proposed) peut être une estimation qui ne correspond
// pas à la réalité du dossier -- il faut pouvoir la retirer d'un clic plutôt que de
// laisser une donnée estimée incorrecte traîner dans l'échéancier.
export function DeleteMilestoneButton({ grantProjectId, milestoneId }: { grantProjectId: string; milestoneId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => deleteMilestoneAction(grantProjectId, milestoneId))}
      className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
      title="Retirer cette échéance"
    >
      {isPending ? "..." : "Retirer"}
    </button>
  );
}
