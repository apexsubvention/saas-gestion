"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createGrantProjectAction, type CreateGrantFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "Créer le projet"}
    </button>
  );
}

type Option = { id: string; label: string };

export function NewGrantProjectForm({
  clients,
  programs,
  defaultClientId,
}: {
  clients: Option[];
  programs: Option[];
  defaultClientId?: string;
}) {
  const initialState: CreateGrantFormState = { error: null };
  const [state, formAction] = useFormState(createGrantProjectAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Client *</label>
        <select
          name="client_id"
          required
          defaultValue={defaultClientId ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Sélectionner un client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {clients.length === 0 && (
          <p className="text-xs text-amber-600">
            Aucun client — <a href="/clients/new" className="underline">en créer un</a> d&apos;abord.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Programme *</label>
        <select name="program_id" required defaultValue="" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="" disabled>
            Sélectionner un programme
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {programs.length === 0 && (
          <p className="text-xs text-amber-600">
            Aucun programme — <a href="/programs/new" className="underline">en créer un</a> d&apos;abord.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Nom du projet *</label>
        <input name="name" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Coût total du projet</label>
          <input name="total_project_cost" type="number" step="0.01" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Montant approuvé</label>
          <input name="approved_grant_amount" type="number" step="0.01" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Début officiel</label>
          <input name="official_start_date" type="date" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Fin officielle</label>
          <input name="official_end_date" type="date" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
