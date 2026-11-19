"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { generateSitegrowScheduleAction, type BillingActionResult } from "./actions";
import {
  buildSitegrowPlan,
  chooseSitegrowPlan,
  projectMonths,
  sitegrowMonthlyPeriods,
  SITEGROW_LEVEL_LABELS,
  SITEGROW_LEVELS,
  type SitegrowLevel,
} from "@/features/billing/sitegrowPackages";

const initialState: BillingActionResult = { error: null };
const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Génération…" : "Générer selon le forfait Sitegrow"}
    </button>
  );
}

// Jade : clients enfants de Sitegrow -- Apex propose le forfait (et le nombre de mois) dont le total
// est le plus proche du total à facturer, dans la durée du projet. Modifiable avant de générer.
export function SitegrowScheduleForm({
  grantProjectId,
  totalAmount,
  projectStart,
  projectEnd,
  disabled,
}: {
  grantProjectId: string;
  totalAmount: number;
  projectStart: string;
  projectEnd: string;
  disabled: boolean;
}) {
  const maxMonths = projectMonths(projectStart, projectEnd);
  const suggested = useMemo(() => chooseSitegrowPlan(totalAmount, maxMonths), [totalAmount, maxMonths]);
  const [level, setLevel] = useState<SitegrowLevel>(suggested?.level ?? "essentiel");
  const [months, setMonths] = useState<number>(suggested?.months ?? Math.min(3, maxMonths));
  const plan = buildSitegrowPlan(level, months, totalAmount);
  const periods = sitegrowMonthlyPeriods(projectStart, projectEnd, months);
  const isSuggested = suggested != null && suggested.level === level && suggested.months === months;

  const action = generateSitegrowScheduleAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-violet-200 bg-violet-50/50 p-3">
      <div>
        <p className="text-sm font-medium text-neutral-900">Client de Sitegrow — calendrier selon le forfait</p>
        <p className="text-xs text-neutral-500">
          Apex propose le forfait Sitegrow et le nombre de mois dont le total se rapproche le plus du total à facturer
          ({money(totalAmount)}), dans la durée du projet ({maxMonths} mois). Un versement par mois de service, au prix du forfait.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-neutral-600">
          Forfait
          <select name="level" value={level} onChange={(e) => setLevel(e.target.value as SitegrowLevel)} className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {SITEGROW_LEVELS.map((l) => (
              <option key={l} value={l}>
                {SITEGROW_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Nombre de mois
          <select name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {suggested && !isSuggested && (
          <button
            type="button"
            onClick={() => {
              setLevel(suggested.level);
              setMonths(suggested.months);
            }}
            className="text-xs text-violet-700 underline"
          >
            Revenir à la suggestion
          </button>
        )}
      </div>

      <div className="rounded-md bg-white p-2 text-xs text-neutral-700 ring-1 ring-neutral-200">
        <p>
          {isSuggested && <span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800">Suggéré</span>}
          <strong>{SITEGROW_LEVEL_LABELS[level]}</strong> — tarif engagement {plan.tier} mois : {months} × {money(plan.monthlyPrice)} ={" "}
          <strong>{money(plan.total)}</strong>
        </p>
        <p className={Math.abs(plan.gap) < 0.01 ? "text-emerald-700" : plan.gap > 0 ? "text-amber-700" : "text-neutral-500"}>
          {Math.abs(plan.gap) < 0.01
            ? "Correspond exactement au total à facturer."
            : plan.gap > 0
              ? `Dépasse le total à facturer de ${money(plan.gap)}.`
              : `${money(-plan.gap)} sous le total à facturer.`}
        </p>
        <ul className="mt-1 list-inside list-disc text-neutral-500">
          {periods.map((p) => (
            <li key={p.installment_number}>
              Versement {p.installment_number} : {p.period_start} → {p.period_end} — {money(plan.monthlyPrice)}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton disabled={disabled} />
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state.ok && <span className="text-xs text-emerald-700">Fait ✓</span>}
      </div>
    </form>
  );
}
