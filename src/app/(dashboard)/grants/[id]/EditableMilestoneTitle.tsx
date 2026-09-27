"use client";

// Jade : pouvoir corriger le libellé d'une échéance, y compris une échéance générée
// automatiquement à partir de l'entente (ex. « Réclamation mi-projet ») -- jusqu'ici seul son
// statut était modifiable après création. Même idiome que EditableGrantProjectName (clic pour
// passer en édition, Entrée pour enregistrer, Échap pour annuler).
import { useState, useTransition } from "react";
import { updateMilestoneTitleAction } from "./actions";

export function EditableMilestoneTitle({
  grantProjectId,
  milestoneId,
  initialTitle,
}: {
  grantProjectId: string;
  milestoneId: string;
  initialTitle: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setEditing(false);
    setDraft(title);
    setError(null);
  }

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Le titre ne peut pas être vide.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMilestoneTitleAction(grantProjectId, milestoneId, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle(trimmed);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setError(null);
          setEditing(true);
        }}
        className="text-left hover:underline"
        title="Modifier le libellé de cette échéance"
      >
        {title}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={isPending}
        autoFocus
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") cancel();
        }}
      />
      <button type="button" disabled={isPending} onClick={submit} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
        {isPending ? "…" : "OK"}
      </button>
      <button type="button" disabled={isPending} onClick={cancel} className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600">
        Annuler
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </span>
  );
}
