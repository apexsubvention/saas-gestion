"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProgramAction, type CreateProgramFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Création..." : "Créer le programme"}
    </button>
  );
}

export default function NewProgramPage() {
  const initialState: CreateProgramFormState = { error: null };
  const [state, formAction] = useFormState(createProgramAction, initialState);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Nouveau programme</h1>
      <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Nom *</label>
          <input name="name" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Organisme</label>
          <input name="agency" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Type</label>
          <input name="program_type" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Territoire</label>
          <input name="territory" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Description</label>
          <textarea name="description" rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
