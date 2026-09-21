"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { analyzeProjectAction, checkExpenseAction } from "./actions";
import type { AnalysisResult, Confidence, CriterionStatus } from "@/features/drafting/analyze";
import type { ExpenseCheck } from "@/features/drafting/expense";
import type { AnalysisRow } from "@/server/services/drafting.service";

const STATUS_LABEL: Record<CriterionStatus, { label: string; className: string }> = {
  met: { label: "Rempli", className: "bg-emerald-50 text-emerald-700" },
  partly: { label: "En partie", className: "bg-amber-50 text-amber-800" },
  not_met: { label: "Non rempli", className: "bg-red-50 text-red-700" },
  unknown: { label: "À confirmer", className: "bg-neutral-100 text-neutral-600" },
};
const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "Confiance élevée", medium: "Confiance moyenne", low: "Confiance faible — à valider" };

function Source({ title, quote, verified }: { title: string | null; quote: string | null; verified: boolean }) {
  if (!quote) return <span className="text-neutral-400">Aucune source citée</span>;
  return (
    <span className="block">
      <span className={verified ? "text-emerald-700" : "text-amber-700"}>{verified ? "✓ Source vérifiée" : "⚠ Source non vérifiée dans les documents"}</span>
      {title && <span className="text-neutral-400"> — {title}</span>}
      <span className="mt-0.5 block border-l-2 border-neutral-300 pl-2 italic text-neutral-500">« {quote} »</span>
    </span>
  );
}

function List({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "neutral" | "good" | "bad" }) {
  if (items.length === 0) return null;
  const dot = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-neutral-400";
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
      <ul className="space-y-0.5 text-sm text-neutral-700">{items.map((i, k) => <li key={k} className="flex gap-2"><span className={dot}>•</span><span>{i}</span></li>)}</ul>
    </section>
  );
}

function AnalysisView({ analysis }: { analysis: AnalysisResult }) {
  const { assessment: a, compatibility: c } = analysis;
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
        <p className="text-base font-semibold text-indigo-950">{c.headline}</p>
        {c.score != null && <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${c.score}%` }} /></div>}
        <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm text-neutral-700 sm:grid-cols-2">
          {c.parts.map((p) => (
            <li key={p.label} className={p.included ? "" : "text-neutral-400"}>
              <span className="font-medium">{p.label} :</span> {p.detail}{p.included && <span className="text-neutral-400"> ({p.points}/{p.max})</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">Ce pourcentage mesure la compatibilité avec les critères connus du programme, calculée par Apex à partir des évaluations ci-dessous. Ce n&apos;est <strong>pas</strong> une probabilité d&apos;obtenir la subvention.</p>
      </div>

      {a.summary && <p className="text-sm text-neutral-700">{a.summary}</p>}

      {a.criteria.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-900">Critères du programme</h4>
          <ul className="space-y-2">
            {a.criteria.map((cr, i) => {
              const st = STATUS_LABEL[cr.status];
              return (
                <li key={i} className="rounded-md border border-neutral-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.className}`}>{st.label}</span>
                    {cr.mandatory && <span className="text-[11px] font-medium uppercase text-neutral-400">obligatoire</span>}
                    <span className="font-medium text-neutral-900">{cr.criterion}</span>
                    <span className="ml-auto text-[11px] text-neutral-400">{CONFIDENCE_LABEL[cr.confidence]}</span>
                  </div>
                  {cr.comment && <p className="mt-1 text-neutral-600">{cr.comment}</p>}
                  <p className="mt-1 text-xs"><Source title={cr.source_title} quote={cr.source_quote} verified={cr.verified} /></p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(a.objectives_comment || a.budget_comment) && (
        <section className="space-y-1 text-sm text-neutral-700">
          {a.objectives_comment && <p><span className="font-medium">Objectifs du programme :</span> {a.objectives_comment}</p>}
          {a.budget_comment && <p><span className="font-medium">Budget :</span> {a.budget_comment}</p>}
        </section>
      )}

      {a.problematic_expenses.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-900">Dépenses problématiques</h4>
          <ul className="space-y-2">
            {a.problematic_expenses.map((e, i) => (
              <li key={i} className="rounded-md border border-red-100 bg-red-50/40 p-3 text-sm">
                <p className="font-medium text-neutral-900">{e.expense}</p>
                <p className="text-neutral-700">{e.reason}</p>
                <p className="mt-1 text-xs"><Source title={e.source_title} quote={e.source_quote} verified={e.verified} /></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <List title="Forces" items={a.strengths} tone="good" />
        <List title="Faiblesses" items={a.weaknesses} tone="bad" />
        <List title="Informations manquantes" items={a.missing_info} />
        <List title="Risques" items={a.risks} tone="bad" />
      </div>
      <List title="Questions à poser au client" items={a.questions_to_ask} />
      <List title="Suggestions de positionnement (présenter honnêtement le projet réel)" items={a.positioning_suggestions} tone="good" />
      <p className="text-xs text-neutral-400">Sources consultées : {analysis.sourcesChecked.join(" ; ")}</p>
    </div>
  );
}

const VERDICT: Record<ExpenseCheck["verdict"], { label: string; className: string }> = {
  admissible: { label: "Admissible", className: "bg-emerald-50 text-emerald-800" },
  non_admissible: { label: "Semble non admissible", className: "bg-red-50 text-red-800" },
  a_verifier: { label: "À vérifier", className: "bg-amber-50 text-amber-900" },
};

function ExpensePanel({ grantProjectId }: { grantProjectId: string }) {
  const [expense, setExpense] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<ExpenseCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setResult(null);
    const n = amount.trim() ? Number(amount.replace(/\s| /g, "").replace(",", ".").replace("$", "")) : null;
    if (n != null && !Number.isFinite(n)) return setError("Montant invalide.");
    startTransition(async () => {
      const r = await checkExpenseAction(grantProjectId, expense, n);
      if (r.ok) setResult(r.check);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1 space-y-1 text-xs text-neutral-500">Dépense à vérifier
          <input value={expense} onChange={(e) => setExpense(e.target.value)} placeholder="Ex. Billet d'avion Montréal–Paris pour un salon" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800" />
        </label>
        <label className="w-36 space-y-1 text-xs text-neutral-500">Montant ($)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800" />
        </label>
        <button onClick={run} disabled={pending || expense.trim().length < 3} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Vérification…" : "Vérifier"}</button>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[result.verdict].className}`}>{VERDICT[result.verdict].label}</span>
            <span className="text-[11px] text-neutral-400">{CONFIDENCE_LABEL[result.confidence]}</span>
          </div>
          <p className="mt-2 text-neutral-700">{result.reason}</p>
          <p className="mt-1 text-xs"><Source title={result.source_title} quote={result.source_quote} verified={result.verified} /></p>
        </div>
      )}
    </div>
  );
}

export function DraftingWorkspace({
  grantProjectId,
  initialText,
  history,
  programDocuments,
  configured,
}: {
  grantProjectId: string;
  initialText: string;
  history: AnalysisRow[];
  programDocuments: string[];
  configured: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(history[0]?.result ?? null);
  const [analysisFrom, setAnalysisFrom] = useState<string | null>(history[0]?.created_at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await analyzeProjectAction(grantProjectId, text);
      if (r.ok) { setAnalysis(r.result); setAnalysisFrom(new Date().toISOString()); }
      else setError(r.error);
    });
  }

  // Documents à rassembler : ceux repérés par l'analyse + ceux que le programme exige (sans doublon).
  const wanted = [...new Map([...(analysis?.assessment.missing_documents ?? []), ...programDocuments].map((d) => [d.trim().toLowerCase(), d.trim()])).values()];

  if (!configured) return <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">L&apos;aide à la rédaction nécessite la variable <code className="rounded bg-neutral-100 px-1">ANTHROPIC_API_KEY</code> dans Vercel.</p>;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900">1. Explique-moi ton projet</h2>
        <p className="text-sm text-neutral-500">Décris librement le projet du client. Apex l&apos;analyse avec les critères du programme, la fiche du client et le dossier.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={6000} placeholder="Ex. Le client veut développer un nouveau casque de réalité virtuelle, embaucher deux développeurs et participer à un salon à Paris pour lancer le produit en France…" className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm" />
        <button onClick={run} disabled={pending || text.trim().length < 20} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Analyse en cours…" : "Analyser la compatibilité"}</button>
        {pending && <p className="flex items-center gap-2 text-sm text-neutral-600"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> Analyse du projet avec les documents du programme — quelques dizaines de secondes.</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </section>

      {analysis && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900">2. Analyse {analysisFrom && <span className="text-xs font-normal text-neutral-400">— {new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeStyle: "short" }).format(new Date(analysisFrom))}</span>}</h2>
          <AnalysisView analysis={analysis} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900">3. Budget intelligent — vérifier une dépense</h2>
        <p className="text-sm text-neutral-500">Chaque verdict cite le passage du programme qui l&apos;appuie ; sans source vérifiable, il reste « à vérifier ».</p>
        <ExpensePanel grantProjectId={grantProjectId} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900">4. Documents à rassembler</h2>
        {wanted.length === 0 ? (
          <p className="text-sm text-neutral-400">Lance l&apos;analyse pour obtenir la liste des documents manquants (elle s&apos;ajoute à ceux que le programme exige).</p>
        ) : (
          <>
            <ul className="space-y-1 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
              {wanted.map((d) => (
                <li key={d}>
                  <label className="flex items-center gap-2 text-neutral-700">
                    <input type="checkbox" checked={checked.has(d)} onChange={() => setChecked((prev) => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; })} />
                    <span className={checked.has(d) ? "text-neutral-400 line-through" : ""}>{d}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-400">Cette liste est un aide-mémoire (les coches ne sont pas enregistrées). La demande automatique au client depuis son portail viendra avec la phase portail.</p>
          </>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-neutral-900">Analyses précédentes</h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-neutral-200 bg-white p-3">
                <button className="w-full text-left text-sm" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
                  <span className="font-medium text-neutral-800">{h.result.compatibility.headline}</span>
                  <span className="ml-2 text-xs text-neutral-400">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(new Date(h.created_at))}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">{h.description}</span>
                </button>
                {openId === h.id && <div className="mt-3"><AnalysisView analysis={h.result} /></div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
