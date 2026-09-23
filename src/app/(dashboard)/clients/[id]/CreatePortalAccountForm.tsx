"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createPortalAccountAction, type CreatePortalAccountFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "Créer le compte portail"}
    </button>
  );
}

export function CreatePortalAccountForm({ clientId }: { clientId: string }) {
  const action = createPortalAccountAction.bind(null, clientId);
  const initialState: CreatePortalAccountFormState = { error: null, createdEmail: null, tempPassword: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Nom du contact</label>
        <input name="full_name" type="text" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Courriel</label>
        <input name="email" type="email" required className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.tempPassword && (
        <div className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Compte créé pour {state.createdEmail}.</p>
          <p className="mt-1">
            Mot de passe : <code className="rounded bg-white px-1.5 py-0.5 font-mono">{state.tempPassword}</code>
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Transmets ces identifiants toi-même à la personne concernée (aucun courriel n&apos;est envoyé
            automatiquement) — tu pourras le revoir et le régénérer en tout temps depuis cette page.
          </p>
        </div>
      )}
    </form>
  );
}
