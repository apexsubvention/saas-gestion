"use client";

// Ajout manuel rapide d'une tâche depuis l'échéancier global : client obligatoire, dossier
// facultatif (la liste se filtre au client choisi), note obligatoire. Repliable (comme les
// formulaires d'ajout ailleurs dans l'app) pour ne pas encombrer la vue par défaut.
import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createGlobalTaskAction, type GlobalTaskActionResult } from "./actions";

type ClientOption = { id: string; name: string };
type ProjectOption = { id: string; name: string; client_id: string; programName: string | null };

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const initialState: GlobalTaskActionResult = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Ajout…" : "+ Ajouter la tâche"}
    </button>
  );
}

export function QuickAddTaskForm({ clients, projects }: { clients: ClientOption[]; projects: ProjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [state, formAction] = useFormState(createGlobalTaskAction, initialState);
  const [resetKey, setResetKey] = useState(0);

  const projectsForClient = useMemo(() => projects.filter((p) => p.client_id === clientId), [projects, clientId]);

  useEffect(() => {
    if (state.id) {
      setResetKey((k) => k + 1);
      setClientId("");
    }
  }, [state.id]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
        + Ajouter une tâche
      </button>
    );
  }

  return (
    <form key={resetKey} action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Nouvelle tâche</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-700">
          Fermer
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-neutral-600">
          Client <span className="text-red-600">*</span>
          <select name="client_id" required value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
            <option value="">Choisir un client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-medium text-neutral-600">
          Programme / dossier (facultatif)
          <select name="grant_project_id" disabled={!clientId} className={input} defaultValue="">
            <option value="">Aucun dossier précis</option>
            {projectsForClient.map((p) => (
              <option key={p.id} value={p.id}>
                {p.programName ?? p.name}
                {p.programName ? ` — ${p.name}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-xs font-medium text-neutral-600">
        Note <span className="text-red-600">*</span>
        <textarea name="note" required rows={2} placeholder="Ce qu'il faut faire…" className={input} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-2">
        <SubmitButton />
        {!clientId && <p className="text-xs text-neutral-400">Choisis d&apos;abord un client.</p>}
      </div>
    </form>
  );
}
