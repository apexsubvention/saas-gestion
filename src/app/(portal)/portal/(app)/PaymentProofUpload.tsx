"use client";

// Preuve de paiement d'une facture fournisseur (0057) -- même principe que
// InstallmentInvoiceUpload.tsx : téléverser LE fichier EST l'action ; ça marque aussi la
// facture « Payée » automatiquement (voir uploadInvoicePaymentProofAction). Contrairement à
// InstallmentInvoiceUpload, le fichier reste remplaçable (le client peut se tromper de
// document) -- pas de confirmation qui bloque le formulaire.
import { useFormState, useFormStatus } from "react-dom";
import { uploadInvoicePaymentProofAction, type PortalUploadFormState } from "./actions";
import { PortalOpenDocumentButton } from "./PortalOpenDocumentButton";

function SubmitButton({ hasExisting }: { hasExisting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
      {pending ? "Envoi…" : hasExisting ? "Remplacer" : "Téléverser la preuve"}
    </button>
  );
}

export function PaymentProofUpload({ expenseId, proof }: { expenseId: string; proof: { id: string; filename: string } | null }) {
  const action = uploadInvoicePaymentProofAction.bind(null, expenseId);
  const initialState: PortalUploadFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {proof && (
        <span className="flex items-center gap-2 text-xs text-emerald-700">
          ✓ Preuve reçue (<PortalOpenDocumentButton documentId={proof.id} filename={proof.filename} />)
        </span>
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input name="file" type="file" required className="text-xs" />
        <SubmitButton hasExisting={!!proof} />
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      </form>
    </div>
  );
}
