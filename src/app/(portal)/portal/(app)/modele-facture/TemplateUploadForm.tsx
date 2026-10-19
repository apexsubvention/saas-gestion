"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { downloadInvoiceTemplateAction, uploadInvoiceTemplateAction, type TemplateFormState } from "../invoiceTemplateActions";
import { usePortalAccess } from "../PortalAccessContext";
import { FileInput } from "@/components/forms/FileInput";
import { downloadBase64 } from "../downloadBase64";

function SubmitButton({ replacing }: { replacing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Préparation du modèle… (jusqu'à une minute)" : replacing ? "Remplacer le modèle" : "Téléverser le modèle"}
    </button>
  );
}

export function TemplateUploadForm({ replacing }: { replacing: boolean }) {
  const { canEdit } = usePortalAccess();
  const [state, formAction] = useFormState(uploadInvoiceTemplateAction, { error: null } as TemplateFormState);
  if (!canEdit) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <span className="w-full text-xs font-medium text-neutral-600">{replacing ? "Nouvelle version du modèle (Word .docx)" : "Votre facture vierge (Word .docx)"}</span>
      <FileInput name="file" required accept=".docx" className="text-xs" />
      <SubmitButton replacing={replacing} />
      {state.error && <span className="w-full text-sm text-red-600">{state.error}</span>}
      {state.message && <span className="w-full text-sm text-emerald-700">✓ {state.message}</span>}
    </form>
  );
}

export function DownloadTemplateButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await downloadInvoiceTemplateAction();
            if (r.error || !r.base64) setError(r.error ?? "Téléchargement impossible.");
            else downloadBase64(r.base64, r.filename ?? "modele-facture.docx");
          })
        }
        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Télécharger le modèle préparé"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
