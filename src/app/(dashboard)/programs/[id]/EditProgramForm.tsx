"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProgramAction, type UpdateProgramFormState } from "./actions";
import type { ProgramRow } from "@/server/repositories/programs.repository";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Enregistrement…" : "Enregistrer les modifications"}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

export function EditProgramForm({ program }: { program: ProgramRow }) {
  const action = updateProgramAction.bind(null, program.id);
  const initial: UpdateProgramFormState = { error: null, savedAt: null };
  const [state, formAction] = useFormState(action, initial);
  const ratePercent = program.typical_aid_rate == null ? "" : String(Math.round(program.typical_aid_rate * 10000) / 100);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom *"><input name="name" required defaultValue={program.name} className={input} /></Field>
        <Field label="Organisme"><input name="agency" defaultValue={program.agency ?? ""} className={input} /></Field>
        <Field label="Type"><input name="program_type" defaultValue={program.program_type ?? ""} className={input} /></Field>
        <Field label="Territoire"><input name="territory" defaultValue={program.territory ?? ""} className={input} /></Field>
      </div>
      <Field label="URL de la page du programme"><input name="source_url" type="url" defaultValue={program.source_url ?? ""} className={input} /></Field>
      <Field label="Description"><textarea name="description" rows={3} defaultValue={program.description ?? ""} className={input} /></Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="% remboursé (max.)" hint="Ex. 50"><input name="aid_rate_percent" inputMode="decimal" defaultValue={ratePercent} className={input} /></Field>
        <Field label="Montant maximal ($)"><input name="max_aid_amount" inputMode="decimal" defaultValue={program.max_aid_amount ?? ""} className={input} /></Field>
        <Field label="Dépenses minimales ($)"><input name="min_eligible_spend" inputMode="decimal" defaultValue={program.min_eligible_spend ?? ""} className={input} /></Field>
        <Field label="Ouverture des dépôts"><input name="open_date" type="date" defaultValue={program.open_date ?? ""} className={input} /></Field>
        <Field label="Date limite de dépôt"><input name="deadline" type="date" defaultValue={program.deadline ?? ""} className={input} /></Field>
        <Field label="Disponibilité">
          <select name="availability_status" defaultValue={program.availability_status} className={input}>
            <option value="unknown">À confirmer</option>
            <option value="open">Ouvert</option>
            <option value="opening_soon">Ouverture bientôt</option>
            <option value="continuous">En continu</option>
            <option value="closed">Fermé</option>
          </select>
        </Field>
      </div>
      <Field label="Périodes de dépôt (précisions)"><input name="filing_notes" defaultValue={program.filing_notes ?? ""} className={input} /></Field>
      <Field label="Formule d'aide (taux, plafonds, cumul)"><textarea name="aid_notes" rows={2} defaultValue={program.aid_notes ?? ""} className={input} /></Field>
      <Field label="Dépenses admissibles"><textarea name="eligible_expenses" rows={3} defaultValue={program.eligible_expenses ?? ""} className={input} /></Field>
      <Field label="Dépenses non admissibles"><textarea name="ineligible_expenses" rows={3} defaultValue={program.ineligible_expenses ?? ""} className={input} /></Field>
      <Field label="Processus de demande"><textarea name="application_process" rows={3} defaultValue={program.application_process ?? ""} className={input} /></Field>
      <Field label="Réclamation / remboursement"><textarea name="claim_process" rows={3} defaultValue={program.claim_process ?? ""} className={input} /></Field>
      <Field label="Documents à préparer pour rédiger la demande" hint="Un par ligne.">
        <textarea name="required_documents" rows={4} defaultValue={(program.required_documents ?? []).join("\n")} className={input} />
      </Field>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.savedAt && !state.error && <p className="text-sm text-emerald-700">Modifications enregistrées.</p>}
      <SubmitButton />
    </form>
  );
}
