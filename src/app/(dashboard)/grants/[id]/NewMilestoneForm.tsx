"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createMilestoneAction, type CreateMilestoneFormState } from "./scheduleActions";
import { MILESTONE_TYPE_LABELS } from "@/features/schedule/dismissals";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Ajout…" : "+ Nouvelle échéance"}
    </button>
  );
}

// Échéance ajoutée à la main (rapport, suivi, dépôt...), en plus de celles suggérées à partir de l'entente.
export function NewMilestoneForm({ grantProjectId }: { grantProjectId: string }) {
  const action = createMilestoneAction.bind(null, grantProjectId);
  const initialState: CreateMilestoneFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  const field = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Titre</label>
        <input name="title" type="text" required maxLength={200} placeholder="Ex. Rapport d'étape à remettre au programme" className={`w-full ${field}`} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Type</label>
        <select name="type" defaultValue="other" className={field}>
          {Object.entries(MILESTONE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Date</label>
        <input name="date" type="date" required className={field} />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
