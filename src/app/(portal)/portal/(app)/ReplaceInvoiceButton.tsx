"use client";

// « Remplacer » une facture déjà envoyée (Jade) : le fournisseur l'a corrigée, le client téléverse
// la nouvelle version à la place de l'ancienne -- voir replacePortalInvoiceAction (actions.ts) et
// invoiceReplacement.service.ts. Lien discret qui déplie un petit formulaire.
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { replacePortalInvoiceAction, type PortalUploadFormState } from "./actions";
import { usePortalAccess } from "./PortalAccessContext";
import { FileInput } from "@/components/forms/FileInput";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
      {pending ? "Envoi..." : "Envoyer la nouvelle version"}
    </button>
  );
}

export function ReplaceInvoiceButton({ expenseId = null, installmentId = null }: { expenseId?: string | null; installmentId?: string | null }) {
  const { canEdit } = usePortalAccess();
  const [open, setOpen] = useState(false);
  const action = replacePortalInvoiceAction.bind(null, { expenseId, installmentId });
  const [state, formAction] = useFormState(action, { error: null } as PortalUploadFormState);

  useEffect(() => {
    if (state.message) setOpen(false);
  }, [state]);

  if (!canEdit) return null;

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline" title="Téléverser une version corrigée à la place de cette facture">
          Remplacer
        </button>
        {state.message && <span className="text-xs text-emerald-700">{state.message}</span>}
      </span>
    );
  }

  return (
    <form action={formAction} className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-md bg-neutral-50 p-2">
      <span className="w-full text-xs text-neutral-600">Nouvelle version de la facture (elle remplacera l&apos;ancienne, qui reste conservée par Apex) :</span>
      <FileInput name="file" required className="text-xs" />
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600">
        Annuler
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
