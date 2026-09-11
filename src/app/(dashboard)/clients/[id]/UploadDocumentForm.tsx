"use client";

import { useFormState, useFormStatus } from "react-dom";
import { uploadDocumentAction, type UploadDocumentFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Envoi..." : "Téléverser"}
    </button>
  );
}

export function UploadDocumentForm({ clientId }: { clientId: string }) {
  const action = uploadDocumentAction.bind(null, clientId);
  const initialState: UploadDocumentFormState = { error: null };
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
          <option value="invoice">Facture</option>
          <option value="payment_proof">Preuve de paiement</option>
          <option value="agreement">Convention</option>
          <option value="application">Demande</option>
          <option value="annex">Annexe</option>
          <option value="other">Autre</option>
        </select>
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
