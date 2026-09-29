"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createDocumentRequestAction, type DocumentRequestFormState } from "./documentRequestActions";
import { buildDocumentRequestTargetOptions, documentRequestTargetOptionKey } from "./documentRequestTargetOptions";

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

// 0070 -- Jade : l'attribution (client du dossier / parent / enfant / fournisseur inscrit),
// déménagée depuis les tâches internes (NewTaskForm.tsx) -- voir documentRequestTargetOptions.ts.
// Toujours visible dans le portail de la cible choisie (pas de case à cocher, contrairement aux
// tâches internes : visible_in_client_portal reste toujours true ici).
export function NewDocumentRequestForm({
  grantProjectId,
  clientId,
  clientName,
  claims,
  parentClient,
  childClients,
  suppliers,
}: {
  grantProjectId: string;
  clientId: string;
  clientName: string;
  claims: Array<{ id: string; label: string }>;
  parentClient: { id: string; name: string } | null;
  childClients: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string; hasPortalAccess: boolean }>;
}) {
  const action = createDocumentRequestAction.bind(null, grantProjectId, clientId);
  const initialState: DocumentRequestFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  const targetOptions = useMemo(
    () => buildDocumentRequestTargetOptions({ clientId, clientName, parentClient, childClients, suppliers }),
    [clientId, clientName, parentClient, childClients, suppliers]
  );
  const defaultTargetKey = documentRequestTargetOptionKey("client", clientId);
  const [targetKey, setTargetKey] = useState(defaultTargetKey);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Titre</label>
        <input
          name="title"
          type="text"
          required
          placeholder="Ex. Lettre d'acceptation signée, ou Signer et retourner la convention"
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
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Attribuer à</label>
        <select
          name="target"
          value={targetKey}
          onChange={(e) => setTargetKey(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {targetOptions.map((o) => (
            <option key={documentRequestTargetOptionKey(o.targetKind, o.value)} value={documentRequestTargetOptionKey(o.targetKind, o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[240px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Instructions pour le client</label>
        <input
          name="instructions"
          type="text"
          placeholder="Précisions facultatives"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-1.5 pb-1.5">
        <input
          id="requires_upload"
          name="requires_upload"
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-neutral-300"
        />
        <label htmlFor="requires_upload" className="text-sm text-neutral-700">
          Téléversement d&apos;un document requis
        </label>
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
