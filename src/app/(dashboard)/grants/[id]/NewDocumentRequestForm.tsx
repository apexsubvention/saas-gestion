"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createDocumentRequestAction, type DocumentRequestFormState } from "./documentRequestActions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Envoi..." : "Demander"}
    </button>
  );
}

export function NewDocumentRequestForm({
  grantProjectId,
  clientId,
  claims,
}: {
  grantProjectId: string;
  clientId: string;
  claims: Array<{ id: string; label: string }>;
}) {
  const action = createDocumentRequestAction.bind(null, grantProjectId, clientId);
  const initialState: DocumentRequestFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Titre</label>
        <input
          name="title"
          type="text"
          required
          placeholder="Ex. Lettre d'acceptation signée"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Type</label>
        <input
          name="document_type"
          type="text"
          placeholder="Ex. lettre, facture, preuve de paiement"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Échéance</label>
        <input name="due_date" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      {claims.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Réclamation associée</label>
          <select name="claim_id" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Aucune (dépôt du dossier)</option>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-w-[240px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Instructions pour le client</label>
        <input
          name="instructions"
          type="text"
          placeholder="Précisions facultatives"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
