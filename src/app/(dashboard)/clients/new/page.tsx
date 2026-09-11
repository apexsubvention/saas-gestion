"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createClientAction, type CreateClientFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "Créer le client"}
    </button>
  );
}

export default function NewClientPage() {
  const initialState: CreateClientFormState = { error: null };
  const [state, formAction] = useFormState(createClientAction, initialState);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Nouveau client</h1>

      <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Nom de l&apos;entreprise *</label>
          <input name="name" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Statut</label>
          <select name="status" defaultValue="prospect" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="prospect">Prospect</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Site web</label>
          <input name="website" type="url" placeholder="https://..." className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Secteur</label>
          <input name="sector" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Adresse</label>
          <input name="address" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Notes</label>
          <textarea name="notes" rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <SubmitButton />
      </form>
    </div>
  );
}
