"use client";

import { useEffect, useRef } from "react";
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

export function NewTaskForm({
  grantProjectId,
  clientId,
  assignees,
  claims,
}: {
  grantProjectId: string;
  clientId: string;
  assignees: Array<{ id: string; name: string }>;
  claims: Array<{ id: string; label: string }>;
}) {
  const action = createTaskAction.bind(null, grantProjectId, clientId);
  const initialState: CreateTaskFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  // Formulaire remis à zéro une fois l'élément ajouté (évite un doublon par double envoi).
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
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
          <option value="urgent">Urgente</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Responsable</label>
        <select name="assigned_to" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="">Moi</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {claims.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Réclamation associée</label>
          <select name="claim_id" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Aucune</option>
            {claims.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}
      <div className="w-full space-y-1">
        <label className="text-sm font-medium text-neutral-700">Description (facultatif)</label>
        <textarea name="description" rows={2} className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
