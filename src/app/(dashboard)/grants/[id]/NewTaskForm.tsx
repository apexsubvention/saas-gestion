"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTaskAction, type CreateTaskFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "+ Nouvelle tâche"}
    </button>
  );
}

export function NewTaskForm({ grantProjectId, clientId }: { grantProjectId: string; clientId: string }) {
  const action = createTaskAction.bind(null, grantProjectId, clientId);
  const initialState: CreateTaskFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Titre</label>
        <input
          name="title"
          type="text"
          required
          placeholder="Ex. Envoyer le formulaire de réclamation au client"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Échéance</label>
        <input name="due_date" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Priorité</label>
        <select name="priority" defaultValue="normal" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="low">Basse</option>
          <option value="normal">Normale</option>
          <option value="high">Haute</option>
        </select>
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
