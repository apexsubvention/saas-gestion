"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createClaimAction, type CreateClaimFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "+ Nouvelle réclamation"}
    </button>
  );
}

export function NewClaimForm({ grantProjectId }: { grantProjectId: string }) {
  const action = createClaimAction.bind(null, grantProjectId);
  const initialState: CreateClaimFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  // Formulaire remis à zéro une fois l'élément ajouté (évite un doublon par double envoi).
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Étiquette</label>
        <input
          name="claim_number"
          type="text"
          placeholder="Réclamation 1"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Période — début</label>
        <input name="period_start" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Période — fin</label>
        <input name="period_end" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Échéance de dépôt</label>
        <input name="due_date" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
