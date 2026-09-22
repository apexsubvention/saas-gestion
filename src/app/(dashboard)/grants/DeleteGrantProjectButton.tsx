"use client";

import { useState, useTransition } from "react";
import { deleteGrantProjectAction, deleteGrantProjectAndRedirectAction, type DeleteGrantProjectResult } from "./deleteProjectActions";

// Suppression DÉFINITIVE d'un dossier : documents, entente, réclamations, échéances, tâches,
// fournisseurs, factures, questionnaire et journal disparaissent avec lui. Réservée aux admins
// (le bouton n'est même pas affiché sinon -- voir page.tsx/grants/[id]/page.tsx). Deux protections :
// confirmation du navigateur, puis le nom du dossier à retaper exactement.
export function DeleteGrantProjectButton({
  grantProjectId,
  name,
  redirectAfter = false,
  size = "sm",
}: {
  grantProjectId: string;
  name: string;
  redirectAfter?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!confirm(`Supprimer définitivement le dossier « ${name} » ? Tous ses documents, réclamations, échéances, tâches, fournisseurs et son historique seront perdus. Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const action = redirectAfter ? deleteGrantProjectAndRedirectAction : deleteGrantProjectAction;
      const r: DeleteGrantProjectResult = await action(grantProjectId, confirmName);
      if (r?.error) setError(r.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={size === "sm" ? "text-xs text-neutral-400 hover:text-red-600" : "rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"}
        title="Supprimer ce dossier"
      >
        Supprimer
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-left" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs text-red-800">
        Pour confirmer, retape le nom du dossier : <span className="font-semibold">{name}</span>
      </p>
      <input
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={name}
        className="w-full rounded-md border border-red-300 px-2 py-1.5 text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || confirmName.trim() !== name}
          onClick={submit}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setError(null); setConfirmName(""); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
