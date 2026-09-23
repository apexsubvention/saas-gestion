"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveExternalProjectNumberAction, type DdrActionResult } from "./actions";

const initialState: DdrActionResult = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
      {pending ? "…" : "Enregistrer"}
    </button>
  );
}

export function ExternalProjectNumberForm({ grantProjectId, initialValue }: { grantProjectId: string; initialValue: string }) {
  const action = saveExternalProjectNumberAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="external_project_number"
        defaultValue={initialValue}
        placeholder="ex. 1044499"
        className="w-40 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />
      <SaveButton />
      {state.ok && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
