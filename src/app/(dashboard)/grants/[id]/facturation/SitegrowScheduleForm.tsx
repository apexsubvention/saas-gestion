"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { generateSitegrowScheduleAction, type BillingActionResult } from "./actions";
import {
  buildSitegrowPlan,
  chooseLongerSitegrowPlan,
  chooseSitegrowPlan,
  describeSitegrowPlan,
  projectMonths,
  sitegrowMonthlyPeriods,
  SITEGROW_LEVEL_LABELS,
  SITEGROW_LEVELS,
  type SitegrowLevel,
  type SitegrowPlan,
} from "@/features/billing/sitegrowPackages";

const initialState: BillingActionResult = { error: null };
const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Génération…" : "Générer selon ce forfait"}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      className="text-[11px] text-violet-700 underline"
    >
      {copied ? "Copié ✓" : "Copier pour le client"}
    </button>
  );
}

function GapLine({ plan }: { plan: SitegrowPlan }) {
  const cls = Math.abs(plan.gap) < 0.01 ? "text-emerald-700" : plan.gap > 0 ? "text-amber-700" : "text-neutral-500";
  const text =
    Math.abs(plan.gap) < 0.01
      ? "Partie subventionnée = exactement le total à facturer."
      : plan.gap > 0
        ? `Partie subventionnée : dépasse le total à facturer de ${money(plan.gap)}.`
        : `Partie subventionnée : ${money(-plan.gap)} sous le total à facturer.`;
  return <p className={`text-[11px] ${cls}`}>{text}</p>;
}

// Jade : clients enfants de Sitegrow -- deux suggestions à présenter au client :
// 1) dans la subvention : forfait + nombre de mois le plus proche du total à facturer ;
// 2) engagement plus long (6 ou 12 mois), moins cher par mois : les premiers mois couverts par la
//    subvention, le reste hors subvention (même au-delà des dates du projet).
// Le calendrier généré ne contient que les mois couverts. Tout reste modifiable avant de générer.
export function SitegrowScheduleForm({
  grantProjectId,
  totalAmount,
  projectStart,
  projectEnd,
  programLabel,
  disabled,
}: {
  grantProjectId: string;
  totalAmount: number;
  projectStart: string;
  projectEnd: string;
  programLabel: string;
  disabled: boolean;
}) {
  const maxMonths = projectMonths(projectStart, projectEnd);
  const suggestions = useMemo(() => {
    const first = chooseSitegrowPlan(totalAmount, maxMonths);
    const second = first ? chooseLongerSitegrowPlan(first, totalAmount, maxMonths) : null;
    return [first, second].filter((p): p is SitegrowPlan => p != null);
  }, [totalAmount, maxMonths]);

  const initial = suggestions[0];
  const [level, setLevel] = useState<SitegrowLevel>(initial?.level ?? "essentiel");
  const [months, setMonths] = useState<number>(initial?.months ?? Math.min(3, maxMonths));
  const [engagement, setEngagement] = useState<number>(initial?.engagementMonths ?? Math.min(3, maxMonths));

  const plan = buildSitegrowPlan(level, months, totalAmount, engagement);
  const periods = sitegrowMonthlyPeriods(projectStart, projectEnd, months);
  const selectedIndex = suggestions.findIndex((s) => s.level === level && s.months === months && s.engagementMonths === plan.engagementMonths);

  function pick(s: SitegrowPlan) {
    setLevel(s.level);
    setMonths(s.months);
    setEngagement(s.engagementMonths);
  }

  const engagementOptions = Array.from(new Set([months, 3, 6, 12].filter((n) => n >= months))).sort((a, b) => a - b);

  const action = generateSitegrowScheduleAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-violet-200 bg-violet-50/50 p-3">
      <div>
        <p className="text-sm font-medium text-neutral-900">Client de Sitegrow — calendrier selon le forfait</p>
        <p className="text-xs text-neutral-500">
          Total à facturer : {money(totalAmount)} · durée du projet : {maxMonths} mois. Deux suggestions à présenter au client ;
          le calendrier ne contiendra que les mois couverts par {programLabel}.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {suggestions.map((s, i) => {
          const active = i === selectedIndex;
          return (
            <div
              key={i}
              className={`space-y-1 rounded-md bg-white p-2 text-xs ring-1 ${active ? "ring-2 ring-violet-600" : "ring-neutral-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-neutral-900">
                  {i === 0 ? "Suggestion 1 — dans la subvention" : "Suggestion 2 — engagement plus long, moins cher par mois"}
                </p>
                {active ? (
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">Choisie</span>
                ) : (
                  <button type="button" onClick={() => pick(s)} className="rounded border border-violet-300 px-1.5 py-0.5 text-[11px] text-violet-800 hover:bg-violet-50">
                    Choisir
                  </button>
                )}
              </div>
              <p className="text-neutral-700">{describeSitegrowPlan(s, programLabel)}</p>
              <GapLine plan={s} />
              <CopyButton text={describeSitegrowPlan(s, programLabel)} />
            </div>
          );
        })}
        {suggestions.length === 1 && (
          <p className="self-center text-[11px] text-neutral-500">Pas de 2e suggestion : la 1re est déjà au tarif le plus bas (engagement 12 mois).</p>
        )}
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
          Mois couverts par {programLabel}
          <select
            name="months"
            value={months}
            onChange={(e) => {
              const m = Number(e.target.value);
              setMonths(m);
              if (engagement < m) setEngagement(m);
            }}
            className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Durée de l&apos;engagement Sitegrow
          <select name="engagement" value={plan.engagementMonths} onChange={(e) => setEngagement(Number(e.target.value))} className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {engagementOptions.map((n) => (
              <option key={n} value={n}>
                {n} mois{n === months ? " (= mois couverts)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md bg-white p-2 text-xs text-neutral-700 ring-1 ring-neutral-200">
        <p>{describeSitegrowPlan(plan, programLabel)}</p>
        <GapLine plan={plan} />
        <ul className="mt-1 list-inside list-disc text-neutral-500">
          {periods.map((p) => (
            <li key={p.installment_number}>
              Versement {p.installment_number} : {p.period_start} → {p.period_end} — {money(plan.monthlyPrice)} (couvert par {programLabel})
            </li>
          ))}
          {plan.extraMonths > 0 && (
            <li className="text-neutral-400">
              Puis {plan.extraMonths} mois hors subvention ({money(plan.extraTotal)}), facturés directement au client — pas dans ce calendrier.
            </li>
          )}
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
