"use client";

// « Facture faite » pour un versement précis (0054) -- affiché sous chaque versement du
// calendrier de facturation (DossierCard, SupplierDossierCard). Même principe que
// DocumentRequestUpload : téléverser LE fichier de facture EST l'action qui déclare « la
// facture est faite » -- pas une case à cocher séparée qui pourrait rester cochée sans
// aucun fichier joint (pas utile pour Apex). Une fois envoyée, la confirmation remplace le
// formulaire ; seul le personnel (bouton « Retirer », écran Aide à la facturation) peut la
// faire réapparaître, si le client doit corriger un mauvais fichier.
import { useFormState, useFormStatus } from "react-dom";
import { uploadInstallmentInvoiceAction, type PortalUploadFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {pending ? "Envoi..." : "La facture est faite — l'envoyer"}
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA");
}

export function InstallmentInvoiceUpload({
  installmentId,
  uploadedFilename,
  uploadedAt,
}: {
  installmentId: string;
  uploadedFilename: string | null;
  uploadedAt: string | null;
}) {
  const action = uploadInstallmentInvoiceAction.bind(null, installmentId);
  const initialState: PortalUploadFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  if (uploadedFilename) {
    return (
      <p className="mt-1 text-xs text-emerald-700">
        ✓ Facture envoyée{uploadedAt ? ` le ${formatDate(uploadedAt)}` : ""} ({uploadedFilename})
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
      <input name="file" type="file" required className="text-xs" />
      <SubmitButton />
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
