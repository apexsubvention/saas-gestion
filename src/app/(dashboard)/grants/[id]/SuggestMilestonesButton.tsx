"use client";

import { useFormState, useFormStatus } from "react-dom";
import { suggestMilestonesAction, type SuggestMilestonesState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      {pending ? "Estimation..." : "Suggérer l'échéancier à partir de l'entente"}
    </button>
  );
}

export function SuggestMilestonesButton({ grantProjectId }: { grantProjectId: string }) {
  const action = suggestMilestonesAction.bind(null, grantProjectId);
  const initialState: SuggestMilestonesState = { error: null, created: 0, skipped: 0 };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <SubmitButton />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {!state.error && (state.created > 0 || state.skipped > 0) && (
        <p className="text-xs text-neutral-500">
          {state.created > 0 && `${state.created} échéance(s) estimée(s) ajoutée(s) — à valider ci-dessous.`}
          {state.created > 0 && state.skipped > 0 && " "}
          {state.skipped > 0 && `${state.skipped} déjà présente(s).`}
        </p>
      )}
    </form>
  );
}
