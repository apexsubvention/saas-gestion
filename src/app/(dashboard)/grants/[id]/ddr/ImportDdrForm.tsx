"use client";

// Importer un DDR déjà déposé AVANT Apex (Jade) -- rapport d'état Word/PDF déjà dans les
// Documents du dossier. Voir importDdrStatusReportAction.
import { useFormState, useFormStatus } from "react-dom";
import { importDdrStatusReportAction, type DdrActionResult } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Lecture du rapport…" : "Importer comme DDR déposé"}
    </button>
  );
}

export function ImportDdrForm({ grantProjectId, documents }: { grantProjectId: string; documents: Array<{ id: string; filename: string; isDdr: boolean }> }) {
  const [state, formAction] = useFormState(importDdrStatusReportAction.bind(null, grantProjectId), { error: null } as DdrActionResult);
  const sorted = [...documents].sort((a, b) => Number(b.isDdr) - Number(a.isDdr));
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <select name="document_id" required defaultValue="" className="min-w-64 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
        <option value="" disabled>Choisir le rapport d&apos;état (Documents du dossier)…</option>
        {sorted.map((d) => (
          <option key={d.id} value={d.id}>{d.isDdr ? "📄 " : ""}{d.filename}</option>
        ))}
      </select>
      <Submit />
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      {state.message && <p className="w-full rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{state.message}</p>}
    </form>
  );
}
