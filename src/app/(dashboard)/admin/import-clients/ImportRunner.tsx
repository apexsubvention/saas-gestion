"use client";

import { useFormState, useFormStatus } from "react-dom";
import { runApexClientsImportAction, type RunImportState } from "./actions";

function RunButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Import en cours..." : "Lancer l'import"}
    </button>
  );
}

export function ImportRunner() {
  const initialState: RunImportState = { result: null, error: null };
  const [state, formAction] = useFormState(runApexClientsImportAction, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction}>
        <RunButton />
      </form>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.result && (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <Row label="Clients créés" value={state.result.clientsCreated} />
          <Row label="Clients déjà existants (réutilisés)" value={state.result.clientsReused} />
          <Row label="Programmes créés" value={state.result.programsCreated} />
          <Row label="Projets créés" value={state.result.projectsCreated} />
          <Row label="Projets déjà importés (ignorés)" value={state.result.projectsSkippedExisting} />
          <p>
            <span className="font-medium">{state.result.agreementsCreated}</span> ententes,{" "}
            <span className="font-medium">{state.result.suppliersCreated}</span> fournisseurs,{" "}
            <span className="font-medium">{state.result.expensesCreated}</span> factures,{" "}
            <span className="font-medium">{state.result.claimsCreated}</span> réclamations créées.
          </p>
          {state.result.errors.length > 0 && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="font-medium text-red-700">{state.result.errors.length} erreur(s) :</p>
              <ul className="mt-1 list-disc pl-5 text-red-700">
                {state.result.errors.map((e, i) => (
                  <li key={i}>
                    {e.context} — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string[] }) {
  if (value.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-neutral-900">
        {label} ({value.length})
      </p>
      <p className="text-neutral-600">{value.join(", ")}</p>
    </div>
  );
}
