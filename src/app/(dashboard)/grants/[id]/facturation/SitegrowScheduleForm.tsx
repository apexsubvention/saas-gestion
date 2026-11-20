"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { generateSitegrowScheduleAction, type BillingActionResult } from "./actions";
import {
  buildSitegrowPlan,
  describeSitegrowPlan,
  guessSignedSitegrowLevel,
  nextSitegrowLevel,
  projectMonths,
  sitegrowMonthlyPeriods,
  sitegrowTierForMonths,
  SITEGROW_LEVEL_LABELS,
  SITEGROW_LEVELS,
  SITEGROW_MONTHLY_PRICES,
  SITEGROW_TIERS,
  type SitegrowLevel,
  type SitegrowPlan,
  type SitegrowTier,
} from "@/features/billing/sitegrowPackages";

const initialState: BillingActionResult = { error: null };
const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Génération…" : "Générer les versements de la suggestion choisie"}
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

function PlanPreview({ plan, projectStart, projectEnd }: { plan: SitegrowPlan; projectStart: string; projectEnd: string }) {
  const periods = sitegrowMonthlyPeriods(projectStart, projectEnd, plan.amounts.length);
  return (
    <ul className="mt-1 list-inside list-disc text-[11px] text-neutral-500">
      {periods.map((p, i) => (
        <li key={p.installment_number}>
          Versement {p.installment_number} : {p.period_start} → {p.period_end} — <span className="font-medium text-neutral-700">{money(plan.amounts[i] ?? 0)}</span>
          {i === periods.length - 1 && Math.abs((plan.amounts[i] ?? 0) - plan.monthlyPrice) >= 0.005 ? " (solde)" : ""}
        </li>
      ))}
    </ul>
  );
}

// Jade (2026-11-20) : clients enfants de Sitegrow -- à partir du forfait SIGNÉ avec Sitegrow, deux
// suggestions à présenter au client, toutes deux pour exactement le total à facturer :
// 1) même forfait, une facture par mois au prix du forfait et le solde sur la dernière
//    (ex. 2 500 $/mois, 15 000 $, 5 mois → 4 × 2 500 $ + 5 000 $) ;
// 2) forfait supérieur (vu que c'est subventionné), même règle (→ 4 × 3 500 $ + 1 000 $).
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
  const defaultTier = sitegrowTierForMonths(maxMonths);

  // Forfait signé avec Sitegrow (deviné par défaut : celui dont prix × mois est le plus proche du total).
  const [level, setLevel] = useState<SitegrowLevel>(() => guessSignedSitegrowLevel(totalAmount, maxMonths, defaultTier));
  const [tier, setTier] = useState<SitegrowTier>(defaultTier);
  const [priceText, setPriceText] = useState<string>(String(SITEGROW_MONTHLY_PRICES[level][defaultTier]));
  const [choice, setChoice] = useState<"same" | "upgrade">("same");

  const gridPrice = SITEGROW_MONTHLY_PRICES[level][tier];
  const signedPrice = Number(priceText.replace(",", ".")) > 0 ? Number(priceText.replace(",", ".")) : gridPrice;
  const samePlan = buildSitegrowPlan(level, tier, totalAmount, maxMonths, signedPrice);
  const upLevel = nextSitegrowLevel(level);
  const upPlan = upLevel ? buildSitegrowPlan(upLevel, tier, totalAmount, maxMonths) : null;
  const chosen = choice === "upgrade" && upPlan ? upPlan : samePlan;

  function changeSigned(nextLevel: SitegrowLevel, nextTier: SitegrowTier) {
    setLevel(nextLevel);
    setTier(nextTier);
    setPriceText(String(SITEGROW_MONTHLY_PRICES[nextLevel][nextTier]));
    if (!nextSitegrowLevel(nextLevel)) setChoice("same");
  }

  const action = generateSitegrowScheduleAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);

  const cards: { key: "same" | "upgrade"; title: string; plan: SitegrowPlan | null; empty?: string }[] = [
    { key: "same", title: "Suggestion 1 — même forfait, balance à la fin", plan: samePlan },
    { key: "upgrade", title: "Suggestion 2 — forfait supérieur (subventionné)", plan: upPlan, empty: "Déjà au forfait le plus élevé (Domination)." },
  ];

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-violet-200 bg-violet-50/50 p-3">
      {/* Ce qui sera généré : la suggestion choisie. */}
      <input type="hidden" name="level" value={chosen.level} />
      <input type="hidden" name="tier" value={chosen.tier} />
      <input type="hidden" name="monthly_price" value={chosen.monthlyPrice} />

      <div>
        <p className="text-sm font-medium text-neutral-900">Client de Sitegrow — calendrier selon le forfait signé</p>
        <p className="text-xs text-neutral-500">
          Total à facturer : {money(totalAmount)} · durée du projet : {maxMonths} mois. Une facture par mois au prix du forfait ; la
          dernière reprend le solde de la subvention.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-neutral-600">
          Forfait signé
          <select value={level} onChange={(e) => changeSigned(e.target.value as SitegrowLevel, tier)} className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {SITEGROW_LEVELS.map((l) => (
              <option key={l} value={l}>
                {SITEGROW_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Engagement signé
          <select value={tier} onChange={(e) => changeSigned(level, Number(e.target.value) as SitegrowTier)} className="ml-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            {SITEGROW_TIERS.map((t) => (
              <option key={t} value={t}>
                {t} mois
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Prix signé ($/mois)
          <input
            inputMode="decimal"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="ml-2 w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        {Math.abs(signedPrice - gridPrice) >= 0.005 && <span className="text-[11px] text-amber-700">Différent de la grille ({money(gridPrice)})</span>}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {cards.map((c) => {
          const active = choice === c.key && c.plan != null;
          return (
            <div key={c.key} className={`space-y-1 rounded-md bg-white p-2 text-xs ${active ? "ring-2 ring-violet-600" : "ring-1 ring-neutral-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-neutral-900">{c.title}</p>
                {c.plan &&
                  (active ? (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">Choisie</span>
                  ) : (
                    <button type="button" onClick={() => setChoice(c.key)} className="rounded border border-violet-300 px-1.5 py-0.5 text-[11px] text-violet-800 hover:bg-violet-50">
                      Choisir
                    </button>
                  ))}
              </div>
              {c.plan ? (
                <>
                  <p className="text-neutral-700">{describeSitegrowPlan(c.plan, programLabel)}</p>
                  <PlanPreview plan={c.plan} projectStart={projectStart} projectEnd={projectEnd} />
                  <CopyButton text={describeSitegrowPlan(c.plan, programLabel)} />
                </>
              ) : (
                <p className="text-neutral-500">{c.empty}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton disabled={disabled || chosen.amounts.length === 0} />
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state.ok && <span className="text-xs text-emerald-700">Fait ✓</span>}
      </div>
    </form>
  );
}
