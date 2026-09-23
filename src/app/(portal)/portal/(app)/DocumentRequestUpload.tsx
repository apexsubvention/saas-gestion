"use client";

// Formulaire de téléversement pour UNE demande de document précise -- affiché sous
// chaque demande active dans DossierCard. Une fois reçu (statut != "requested"/"issue"),
// on montre une confirmation plutôt que de réafficher le formulaire, sauf si le
// personnel a signalé un problème (statut "issue"), auquel cas le client peut renvoyer
// un fichier corrigé.
import { useFormState, useFormStatus } from "react-dom";
import { uploadRequestedDocumentAction, type PortalUploadFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
    >
      {pending ? "Envoi..." : "Téléverser"}
    </button>
  );
}

export function DocumentRequestUpload({ requestId, filename }: { requestId: string; filename: string | null }) {
  const action = uploadRequestedDocumentAction.bind(null, requestId);
  const initialState: PortalUploadFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      {filename && <span className="text-xs text-neutral-500">Fichier actuel : {filename}</span>}
      <input name="file" type="file" required className="text-xs" />
      <SubmitButton />
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
