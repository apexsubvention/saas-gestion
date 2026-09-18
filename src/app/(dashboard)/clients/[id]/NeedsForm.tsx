"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { updateClientNeedsAction, type UpdateClientNeedsFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Enregistrement..." : "Enregistrer le besoin"}
    </button>
  );
}

export function NeedsForm({
  clientId,
  initialNeeds,
  needsUpdatedAt,
}: {
  clientId: string;
  initialNeeds: string;
  needsUpdatedAt: string | null;
}) {
  const action = updateClientNeedsAction.bind(null, clientId);
  const initialState: UpdateClientNeedsFormState = { error: null, savedAt: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="current_needs"
        defaultValue={initialNeeds}
        rows={4}
        placeholder="Ex. Le client veut embaucher 3 stagiaires en marketing numérique et implanter un CRM à 40 000 $ d'ici l'automne."
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {initialNeeds && (
          <Link
            href={`/watch?project=${encodeURIComponent(initialNeeds)}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            Cibler des subventions pour ce besoin →
          </Link>
        )}
        {needsUpdatedAt && (
          <span className="text-xs text-neutral-400">
            Mis à jour le {new Date(needsUpdatedAt).toLocaleDateString("fr-CA")}
          </span>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.savedAt && !state.error && <p className="text-sm text-emerald-600">Enregistré.</p>}
    </form>
  );
}
