"use client";

import { useState, useTransition } from "react";
import { applySuggestionsAction, dismissSuggestionAction } from "./suggestionActions";
import type { SuggestionRow } from "@/server/services/aiSuggestions.service";

const CONFIDENCE: Record<SuggestionRow["confidence"], { label: string; className: string }> = {
  high: { label: "Confiance élevée", className: "bg-emerald-50 text-emerald-700" },
  medium: { label: "Confiance moyenne", className: "bg-amber-50 text-amber-800" },
  low: { label: "Confiance faible — à vérifier", className: "bg-red-50 text-red-700" },
};

const money = (n: unknown) => (typeof n === "number" ? new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n) : "—");

function describe(s: SuggestionRow): string[] {
  const p = s.payload ?? {};
  if (s.kind === "supplier") return [`Budget admissible : ${money(p.budget)}`, `Aide accordée : ${money(p.aid)}`];
  if (s.kind === "agreement_terms") {
    const lines: string[] = [];
    if (p.grant_amount != null) lines.push(`Montant accordé : ${money(p.grant_amount)}`);
    if (p.grant_rate_percent != null) lines.push(`Taux d'aide : ${String(p.grant_rate_percent)} %`);
    if (p.project_start || p.project_end) lines.push(`Projet : ${String(p.project_start ?? "?")} → ${String(p.project_end ?? "?")}`);
    if (p.eligible_expense_period_start || p.eligible_expense_period_end) lines.push(`Dépenses admissibles : ${String(p.eligible_expense_period_start ?? "?")} → ${String(p.eligible_expense_period_end ?? "?")}`);
    if (p.claim_frequency) lines.push(`Réclamations : ${String(p.claim_frequency)}`);
    lines.push("Enregistrer ces valeurs crée les échéances de réclamation et met à jour le statut du dossier.");
    return lines;
  }
  return [];
}

// Suggestion ≠ action : Apex propose, l'utilisateur coche et confirme. Les propositions à faible confiance
// ne sont pas cochées par défaut.
export function SuggestionsPanel({ grantProjectId, suggestions }: { grantProjectId: string; suggestions: SuggestionRow[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(suggestions.filter((s) => s.confidence !== "low").map((s) => s.id)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string[]>([]);

  if (suggestions.length === 0 && report.length === 0) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const r = await applySuggestionsAction(grantProjectId, [...checked]);
      if (r.error) setError(r.error);
      else setReport(r.report);
    });
  }

  function dismiss(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await dismissSuggestionAction(grantProjectId, id);
      if (r.error) setError(r.error);
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Apex a détecté {suggestions.length} information{suggestions.length > 1 ? "s" : ""} dans un document</h2>
        <p className="text-xs text-neutral-500">Rien n&apos;est appliqué sans ta confirmation. Coche ce que tu veux ajouter, puis « Appliquer ». Chaque proposition indique sa source dans le document.</p>
      </div>
      {report.length > 0 && (
        <ul className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {report.map((line, i) => <li key={i}>✓ {line}</li>)}
        </ul>
      )}
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const conf = CONFIDENCE[s.confidence];
          return (
            <li key={s.id} className="flex gap-3 rounded-md border border-neutral-200 bg-white p-3">
              <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} className="mt-1" aria-label={s.title} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-neutral-900">{s.title}</p>
                {describe(s).map((line) => <p key={line} className="text-xs text-neutral-600">{line}</p>)}
                <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${conf.className}`}>{conf.label}</span>
                  {s.source_ref ? <span>Source : {s.source_ref}</span> : <span>Source : document téléversé (page non précisée)</span>}
                </p>
              </div>
              <button onClick={() => dismiss(s.id)} disabled={pending} className="self-start rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 disabled:opacity-50">Ignorer</button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {suggestions.length > 0 && (
        <button onClick={apply} disabled={pending || checked.size === 0} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Application…" : `Appliquer la sélection (${checked.size})`}
        </button>
      )}
    </section>
  );
}
