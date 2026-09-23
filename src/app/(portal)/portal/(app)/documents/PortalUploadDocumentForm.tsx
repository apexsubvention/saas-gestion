"use client";

// Dépôt libre d'un document (0046) -- par opposition à DocumentRequestUpload.tsx (répond
// à une demande précise du personnel), formulaire général en haut de la bibliothèque :
// le client choisit un dossier (ou "Documents généraux", sans dossier précis) et une
// catégorie, comme le fait le personnel depuis la fiche dossier (UploadProjectDocumentForm).
import { useFormState, useFormStatus } from "react-dom";
import { DOCUMENT_CATEGORY_OPTIONS } from "@/features/grants/constants";
import { uploadSharedDocumentAction, type PortalUploadDocumentFormState } from "./uploadActions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Envoi…" : "Déposer"}
    </button>
  );
}

export function PortalUploadDocumentForm({ dossiers }: { dossiers: Array<{ id: string; name: string }> }) {
  const initialState: PortalUploadDocumentFormState = { error: null };
  const [state, formAction] = useFormState(uploadSharedDocumentAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
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
      {dossiers.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Dossier</label>
          <select name="grant_project_id" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Documents généraux (aucun dossier précis)</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
