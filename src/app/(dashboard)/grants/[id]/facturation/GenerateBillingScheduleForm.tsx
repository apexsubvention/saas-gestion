"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { generateBillingScheduleAction, regenerateBillingRemainingAction, type BillingActionResult } from "./actions";

const initialState: BillingActionResult = { error: null };

function SubmitButton({ label, pendingLabel, disabled }: { label: string; pendingLabel: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? pendingLabel : label}
    </button>
  );
}

// Deux modes : « generate » (calendrier initial, une seule fois) et « regenerate » (ajuster le
// nombre de versements restants -- les versements déjà marqués facturés sont préservés, voir
// billingInstallments.service.ts).
export function GenerateBillingScheduleForm({
  grantProjectId,
  mode,
  disabled,
  defaultCount = 1,
}: {
  grantProjectId: string;
  mode: "generate" | "regenerate";
  disabled: boolean;
  defaultCount?: number;
}) {
  const action = (mode === "generate" ? generateBillingScheduleAction : regenerateBillingRemainingAction).bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);
  const [count, setCount] = useState(String(defaultCount));

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-medium text-neutral-600">
        {mode === "generate" ? "Nombre de versements" : "Nombre de versements restants"}
        <input
          name="count"
          type="number"
          min={1}
          max={36}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="ml-2 w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>
      <SubmitButton
        label={mode === "generate" ? "Générer les versements" : "Ajuster les versements restants"}
        pendingLabel={mode === "generate" ? "Génération…" : "Ajustement…"}
        disabled={disabled}
      />
      {disabled && (
        <span className="text-xs text-amber-700">
          {mode === "generate" ? "Dates du projet et au moins une activité avec un montant sont requises." : "Date de fin du projet requise."}
        </span>
      )}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-700">Fait ✓</span>}
    </form>
  );
}
