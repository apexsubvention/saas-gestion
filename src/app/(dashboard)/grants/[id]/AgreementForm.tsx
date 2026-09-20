"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveAgreementAction, type SaveAgreementState } from "./actions";
import type { GrantAgreementRow } from "@/server/repositories/grantAgreements.repository";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

function SubmitButton({ exists }: { exists: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Enregistrement…" : exists ? "Mettre à jour l'entente" : "Enregistrer l'entente"}
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

export function AgreementForm({ grantProjectId, agreement }: { grantProjectId: string; agreement: GrantAgreementRow | null }) {
  const action = saveAgreementAction.bind(null, grantProjectId);
  const initial: SaveAgreementState = { error: null, message: null };
  const [state, formAction] = useFormState(action, initial);
  const ratePercent = agreement?.grant_rate == null ? "" : String(Math.round(Number(agreement.grant_rate) * 10000) / 100);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début du projet"><input name="project_start" type="date" defaultValue={agreement?.project_start ?? ""} className={input} /></Field>
        <Field label="Fin du projet"><input name="project_end" type="date" defaultValue={agreement?.project_end ?? ""} className={input} /></Field>
        <Field label="Début de la période d'admissibilité des dépenses"><input name="eligible_expense_period_start" type="date" defaultValue={agreement?.eligible_expense_period_start ?? ""} className={input} /></Field>
        <Field label="Fin de la période d'admissibilité des dépenses"><input name="eligible_expense_period_end" type="date" defaultValue={agreement?.eligible_expense_period_end ?? ""} className={input} /></Field>
        <Field label="Montant accordé ($)"><input name="grant_amount" inputMode="decimal" defaultValue={agreement?.grant_amount ?? ""} className={input} /></Field>
        <Field label="Taux d'aide (%)" hint="Ex. 50"><input name="grant_rate_percent" inputMode="decimal" defaultValue={ratePercent} className={input} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fréquence des réclamations"
          hint="PARI-CNRC : une réclamation (DDR) par mois est générée automatiquement. Pour un autre programme, écris « mensuelle » pour obtenir aussi un DDR par mois."
        >
          <input name="claim_frequency" defaultValue={agreement?.claim_frequency ?? ""} className={input} placeholder="Ex. mensuelle (DDR), trimestrielle, à la fin du projet…" />
        </Field>
        <Field label="Échéance de chaque DDR (jours après la fin du mois)" hint="Utilisé seulement pour les réclamations mensuelles. Par défaut 15 ; ajuste les dates ensuite dans l'échéancier.">
          <input name="ddr_due_delay_days" inputMode="numeric" defaultValue="15" className={input} />
        </Field>
      </div>
      <Field label="Conditions particulières"><textarea name="special_conditions" rows={3} defaultValue={agreement?.special_conditions ?? ""} className={input} /></Field>
      <p className="text-xs text-neutral-500">
        En enregistrant, les dates de réclamation sont estimées à partir de ces dates et ajoutées à l&apos;échéancier (un DDR par mois pour PARI-CNRC), et le
        dossier passe à « Approuvé — en attente de réclamation ».
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && !state.error && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>}
      <SubmitButton exists={Boolean(agreement)} />
    </form>
  );
}
