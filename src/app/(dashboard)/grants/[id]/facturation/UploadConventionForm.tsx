"use client";

import { useFormState, useFormStatus } from "react-dom";
import { analyzeBillingConventionAction, type BillingActionResult } from "./actions";

const initialState: BillingActionResult = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Envoi et lecture…" : "Lire la convention"}
    </button>
  );
}

export function UploadConventionForm({ grantProjectId }: { grantProjectId: string }) {
  const action = analyzeBillingConventionAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Ceci remplace la liste actuelle des activités par ce qui est lu dans le fichier. Continuer ?")) e.preventDefault();
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-neutral-300 p-3"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Convention (PDF ou image)</label>
        <input name="file" type="file" accept=".pdf,image/*" required className="text-sm" />
      </div>
      <SubmitButton />
      {state.info && !state.error && <span className="text-xs text-emerald-700">{state.info}</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
