"use client";

// Jade : le titre du dossier n'était modifiable qu'à la création -- édition en ligne, comme les
// autres champs modifiables de cette page (HideFromParentPortalToggle, StatusSelect).
import { useState, useTransition } from "react";
import { updateGrantProjectNameAction } from "./actions";

export function EditableGrantProjectName({ grantProjectId, initialName }: { grantProjectId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setEditing(false);
    setDraft(name);
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
      const result = await updateGrantProjectNameAction(grantProjectId, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName(trimmed);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setError(null);
            setEditing(true);
          }}
          className="text-xs text-neutral-400 hover:text-neutral-700"
          title="Modifier le titre du dossier"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isPending}
          autoFocus
          className="rounded-md border border-neutral-300 px-2 py-1 text-lg font-semibold text-neutral-900 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") cancel();
          }}
        />
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" disabled={isPending} onClick={cancel} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
