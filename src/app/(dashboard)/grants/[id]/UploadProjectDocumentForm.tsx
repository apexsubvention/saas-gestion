"use client";

import { useFormState, useFormStatus } from "react-dom";
import { DOCUMENT_CATEGORY_OPTIONS } from "@/features/grants/constants";
import { uploadProjectDocumentAction, type UploadProjectDocumentFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Envoi et lecture…" : "Téléverser"}
    </button>
  );
}

export function UploadProjectDocumentForm({
  grantProjectId,
  clientId,
  claims,
}: {
  grantProjectId: string;
  clientId: string;
  claims: Array<{ id: string; label: string }>;
}) {
  const action = uploadProjectDocumentAction.bind(null, grantProjectId, clientId);
  const initialState: UploadProjectDocumentFormState = { error: null, info: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Fichier</label>
        <input name="file" type="file" required className="text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Catégorie</label>
        <select name="category" defaultValue="other" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
          {DOCUMENT_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {claims.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Réclamation associée</label>
          <select name="claim_id" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Aucune / à déterminer</option>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.info && !state.error && <p className="w-full rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.info}</p>}
    </form>
  );
}
