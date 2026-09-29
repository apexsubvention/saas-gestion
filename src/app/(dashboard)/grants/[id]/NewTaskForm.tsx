"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createTaskAction, type CreateTaskFormState } from "./actions";
import { buildTaskTargetOptions, taskTargetOptionKey } from "./taskTargetOptions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Création..." : "+ Nouvelle tâche"}
    </button>
  );
}

export function NewTaskForm({
  grantProjectId,
  clientId,
  clientName,
  assignees,
  claims,
  parentClient,
  childClients,
  suppliers,
}: {
  grantProjectId: string;
  clientId: string;
  clientName: string;
  assignees: Array<{ id: string; name: string }>;
  claims: Array<{ id: string; label: string }>;
  parentClient: { id: string; name: string } | null;
  childClients: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string; hasPortalAccess: boolean }>;
}) {
  const action = createTaskAction.bind(null, grantProjectId, clientId);
  const initialState: CreateTaskFormState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  // Formulaire remis à zéro une fois l'élément ajouté (évite un doublon par double envoi).
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  // 0069 -- à qui attribuer la tâche (client du dossier par défaut, comme avant), et si elle doit
  // apparaître dans son portail -- désactivé tant que la cible choisie n'a pas de portail
  // possible (fournisseur non inscrit).
  const targetOptions = useMemo(
    () => buildTaskTargetOptions({ clientId, clientName, parentClient, childClients, suppliers }),
    [clientId, clientName, parentClient, childClients, suppliers]
  );
  const defaultTargetKey = taskTargetOptionKey("client", clientId);
  const [targetKey, setTargetKey] = useState(defaultTargetKey);
  const selectedTarget = targetOptions.find((o) => taskTargetOptionKey(o.targetKind, o.value) === targetKey);
  useEffect(() => {
    if (state.savedAt) setTargetKey(defaultTargetKey);
  }, [state.savedAt, defaultTargetKey]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1 space-y-1">
        <label className="text-sm font-medium text-neutral-700">Titre</label>
        <input
          name="title"
          type="text"
          required
          placeholder="Ex. Envoyer le formulaire de réclamation au client"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Échéance</label>
        <input name="due_date" type="date" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Priorité</label>
        <select name="priority" defaultValue="normal" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="low">Basse</option>
          <option value="normal">Normale</option>
          <option value="high">Haute</option>
          <option value="urgent">Urgente</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Responsable</label>
        <select name="assigned_to" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
          <option value="">Moi</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {claims.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Réclamation associée</label>
          <select name="claim_id" defaultValue="" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Aucune</option>
            {claims.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
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
            <option key={taskTargetOptionKey(o.targetKind, o.value)} value={taskTargetOptionKey(o.targetKind, o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className={`flex items-center gap-2 text-sm ${selectedTarget?.hasPortalAccess ? "text-neutral-700" : "text-neutral-400"}`}>
          <input type="checkbox" name="visible_in_portal" value="1" disabled={!selectedTarget?.hasPortalAccess} className="h-4 w-4 rounded border-neutral-300" />
          Visible dans son portail
        </label>
        {!selectedTarget?.hasPortalAccess && <p className="text-xs text-neutral-400">Ce fournisseur n&apos;a pas de compte portail.</p>}
      </div>
      <div className="w-full space-y-1">
        <label className="text-sm font-medium text-neutral-700">Description (facultatif)</label>
        <textarea name="description" rows={2} className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
