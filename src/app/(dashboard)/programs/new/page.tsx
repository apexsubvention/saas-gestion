"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProgramAction, type CreateProgramFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Lecture de la page en cours…" : "Créer le programme"}
      </button>
      {pending && <p className="text-xs text-neutral-500">Le SaaS lit la page du programme et ses pages liées : cela peut prendre jusqu&apos;à une minute.</p>}
    </div>
  );
}

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export default function NewProgramPage() {
  const initialState: CreateProgramFormState = { error: null };
  const [state, formAction] = useFormState(createProgramAction, initialState);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Nouveau programme</h1>
      <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="space-y-1 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
          <label className="text-sm font-medium text-neutral-800">URL de la page du programme</label>
          <input name="source_url" type="url" placeholder="https://…" className={input} />
          <p className="text-xs text-neutral-500">
            Le SaaS lit la page et ses pages liées pour remplir la fiche : date de dépôt, montant maximal, % remboursé, documents à
            préparer, processus de réclamation, guides et exemples de projets financés. Tu pourras tout corriger ensuite.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Nom (repris de la page si laissé vide)</label>
          <input name="name" className={input} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Organisme</label>
          <input name="agency" className={input} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Type</label>
          <input name="program_type" className={input} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Territoire</label>
          <input name="territory" className={input} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Description</label>
          <textarea name="description" rows={3} className={input} />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
