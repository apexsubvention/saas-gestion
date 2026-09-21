"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { copilotAction, draftAnswerAction, importQuestionsAction, removeQuestionAction, saveAnswerAction } from "./questionnaireActions";
import { COPILOT_PRESETS, type CopilotResult, type DraftMeta } from "@/features/drafting/questionnaire";
import type { QuestionItem } from "@/server/services/questionnaire.service";

const CONFIDENCE: Record<DraftMeta["confidence"], { label: string; className: string }> = {
  high: { label: "Confiance élevée", className: "bg-emerald-50 text-emerald-700" },
  medium: { label: "Confiance moyenne — à réviser", className: "bg-amber-50 text-amber-800" },
  low: { label: "Confiance faible — beaucoup d'informations manquantes", className: "bg-red-50 text-red-700" },
};

const field = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";
const btn = "rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
const btnPrimary = "rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50";

function DraftInfo({ meta }: { meta: DraftMeta }) {
  const conf = CONFIDENCE[meta.confidence];
  return (
    <div className="space-y-2 rounded-md bg-violet-50/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 font-medium ${conf.className}`}>{conf.label}</span>
        <span className="text-neutral-400">Réponse proposée par Apex le {new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.at))}</span>
      </div>
      {meta.missing_info.length > 0 && (
        <div>
          <p className="font-semibold text-neutral-800">Informations manquantes</p>
          <ul className="list-disc pl-4 text-neutral-600">{meta.missing_info.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {meta.questions_to_ask.length > 0 && (
        <div>
          <p className="font-semibold text-neutral-800">Questions à poser au client</p>
          <ul className="list-disc pl-4 text-neutral-600">{meta.questions_to_ask.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {meta.sources.length > 0 ? (
        <div>
          <p className="font-semibold text-neutral-800">Sources des informations utilisées</p>
          <ul className="space-y-1">
            {meta.sources.map((s, i) => (
              <li key={i}>
                <span className={s.verified ? "text-emerald-700" : "text-amber-700"}>{s.verified ? "✓ vérifiée" : "⚠ non vérifiée"}</span>
                {s.source_title && <span className="text-neutral-400"> — {s.source_title}</span>}
                {s.source_quote && <span className="block border-l-2 border-neutral-300 pl-2 italic text-neutral-500">« {s.source_quote} »</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-neutral-500">Aucune source citée : la réponse repose sur les informations du client et du dossier.</p>
      )}
    </div>
  );
}

function Copilot({ grantProjectId, question, text, onUse }: { grantProjectId: string; question: QuestionItem; text: string; onUse: (revised: string) => void }) {
  const [instruction, setInstruction] = useState("");
  const [keepNumbers, setKeepNumbers] = useState(true);
  const [maxChars, setMaxChars] = useState("");
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(custom?: string) {
    const instr = (custom ?? instruction).trim();
    if (custom) setInstruction(custom);
    const max = maxChars.trim() ? Number(maxChars.replace(/\s/g, "")) : null;
    if (max != null && !Number.isInteger(max)) return setError("Longueur maximale invalide.");
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await copilotAction(grantProjectId, question.id, { instruction: instr, currentText: text, keepNumbers, maxChars: max, extraContext: extra || undefined });
      if (r.ok) setResult(r.result);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-indigo-100 bg-indigo-50/30 p-3">
      <p className="text-xs font-semibold text-indigo-900">Copilote de rédaction</p>
      <div className="flex flex-wrap gap-1.5">
        {COPILOT_PRESETS.map((p) => <button key={p} type="button" onClick={() => run(p)} disabled={pending} className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs text-indigo-800 hover:bg-indigo-50 disabled:opacity-50">{p}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 space-y-1 text-xs text-neutral-500">Ta consigne
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex. Réécris en 2 000 caractères, ajoute les retombées économiques…" className={field} />
        </label>
        <label className="w-36 space-y-1 text-xs text-neutral-500">Longueur max. (car.)
          <input value={maxChars} onChange={(e) => setMaxChars(e.target.value)} inputMode="numeric" placeholder="ex. 2000" className={field} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-neutral-600"><input type="checkbox" checked={keepNumbers} onChange={(e) => setKeepNumbers(e.target.checked)} /> Ne pas changer les chiffres</label>
        <button onClick={() => run()} disabled={pending || instruction.trim().length < 3} className={btnPrimary}>{pending ? "…" : "Demander"}</button>
      </div>
      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer">Contexte supplémentaire à utiliser (ex. notes de la réunion du 12 septembre)</summary>
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} maxLength={6000} className={`${field} mt-2`} placeholder="Colle ici des notes, un extrait de courriel, une transcription…" />
      </details>
      {pending && <p className="flex items-center gap-2 text-xs text-neutral-600"><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> Le copilote travaille…</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {result && (
        <div className="space-y-2 rounded-md bg-white p-3 text-sm">
          {result.comments.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-neutral-700">{result.comments.map((c, i) => <li key={i}>{c}</li>)}</ul>
          )}
          {result.questions_needed.length > 0 && (
            <div className="text-xs">
              <p className="font-semibold text-neutral-800">Informations à obtenir avant de compléter</p>
              <ul className="list-disc pl-4 text-neutral-600">{result.questions_needed.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {result.revised_text && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-neutral-800">{result.revised_text}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-400">{result.length.actual} caractères{result.length.max ? ` (max. ${result.length.max})` : ""}</span>
                {!result.length.ok && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">Dépasse la longueur demandée</span>}
                {result.numbers.checked && (result.numbers.ok
                  ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">✓ Chiffres conservés</span>
                  : <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">Chiffres absents du nouveau texte : {result.numbers.missing.join(", ")}</span>)}
                {/\[À COMPLÉTER/i.test(result.revised_text) && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">Contient des [À COMPLÉTER]</span>}
                <button onClick={() => onUse(result.revised_text!)} className={btnPrimary}>Utiliser cette version</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ grantProjectId, item, index }: { grantProjectId: string; item: QuestionItem; index: number }) {
  const a = item.answer;
  const [text, setText] = useState(a.user_draft ?? a.final_text ?? a.ai_draft ?? "");
  const [meta, setMeta] = useState<DraftMeta | null>(a.ai_meta);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCopilot, setShowCopilot] = useState(false);
  const [extra, setExtra] = useState("");
  const [pending, startTransition] = useTransition();

  const isProposalOnly = !a.user_draft && !a.final_text && !!a.ai_draft && text === a.ai_draft;
  const isFinal = !!a.final_text && text === a.final_text;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) setSaved(done);
      else setError(r.error);
    });
  }

  function draft() {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const r = await draftAnswerAction(grantProjectId, item.id, extra);
      if (!r.ok) return setError(r.error);
      setMeta(r.ai_meta);
      // Le travail de l'utilisateur n'est jamais écrasé : le texte affiché ne change que s'il n'y en avait pas.
      if (!text.trim()) setText(r.ai_draft);
      else setSaved("Nouvelle réponse proposée par Apex (voir ci-dessous) ; ton texte n'a pas été modifié.");
      if (text.trim()) setProposal(r.ai_draft);
    });
  }
  const [proposal, setProposal] = useState<string | null>(null);

  return (
    <li className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-neutral-900"><span className="mr-2 text-neutral-400">{index + 1}.</span>{item.prompt}</p>
        <button onClick={() => { if (confirm("Retirer cette question et sa réponse ?")) run(() => removeQuestionAction(grantProjectId, item.id), "Question retirée."); }} disabled={pending} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50">Retirer</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isFinal && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Version finale</span>}
        {isProposalOnly && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">Proposée par Apex — à réviser</span>}
        <span className="text-neutral-400">{text.length} caractères</span>
      </div>

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={20000} placeholder="Écris ta réponse ou demande une proposition à Apex…" className={field} />

      {proposal && (
        <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <p className="text-xs font-semibold text-violet-900">Nouvelle proposition d&apos;Apex</p>
          <p className="whitespace-pre-wrap text-sm text-neutral-800">{proposal}</p>
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => { setText(proposal); setProposal(null); }}>Remplacer mon texte par cette proposition</button>
            <button className={btn} onClick={() => setProposal(null)}>Ignorer</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={draft} disabled={pending} className={btnPrimary}>{pending ? "…" : a.ai_draft || meta ? "Proposer une nouvelle réponse" : "Proposer une réponse"}</button>
        <button onClick={() => run(() => saveAnswerAction(grantProjectId, item.id, text, undefined), "Enregistré.")} disabled={pending || !text.trim()} className={btn}>Enregistrer</button>
        <button onClick={() => run(() => saveAnswerAction(grantProjectId, item.id, text, text), "Marquée comme version finale.")} disabled={pending || !text.trim()} className={btn}>Marquer comme finale</button>
        <button onClick={() => setShowCopilot((v) => !v)} className={btn}>{showCopilot ? "Fermer le copilote" : "Copilote"}</button>
      </div>
      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer">Contexte supplémentaire pour la proposition (notes de réunion, précisions…)</summary>
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} maxLength={6000} className={`${field} mt-2`} />
      </details>

      {saved && <p className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">{saved}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
      {meta && <DraftInfo meta={meta} />}
      {showCopilot && <Copilot grantProjectId={grantProjectId} question={item} text={text} onUse={(t) => { setText(t); setSaved("Version du copilote appliquée — pense à enregistrer."); }} />}
    </li>
  );
}

export function QuestionnairePanel({ grantProjectId, items }: { grantProjectId: string; items: QuestionItem[] }) {
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function importNow() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const r = await importQuestionsAction(grantProjectId, raw);
      if (r.ok) { setMsg(`${r.added} question(s) importée(s)${r.skipped ? `, ${r.skipped} déjà présente(s)` : ""}.`); setRaw(""); }
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-600">Colle les questions du formulaire du programme (une par ligne, ou numérotées <em>1. … 2. …</em>). Apex propose ensuite une réponse à chacune à partir du client, du dossier et des documents du programme, avec ses sources, son niveau de confiance et ce qui manque.</p>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder={"1. Décrivez le projet et ses objectifs.\n2. Quels sont les résultats attendus ?\n3. Décrivez l'équipe affectée au projet."} className={field} />
        <div className="flex items-center gap-3">
          <button onClick={importNow} disabled={pending || raw.trim().length < 3} className={btnPrimary}>{pending ? "Import…" : "Importer les questions"}</button>
          {msg && <span className="text-xs text-emerald-700">{msg}</span>}
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">Aucune question pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-4">{items.map((q, i) => <QuestionCard key={q.id} grantProjectId={grantProjectId} item={q} index={i} />)}</ul>
      )}
      <p className="text-xs text-neutral-400">Apex ne rend jamais un projet admissible en inventant un fait : ce qui manque est signalé par un marqueur [À COMPLÉTER] et une question à poser. Toute réponse proposée doit être relue avant dépôt.</p>
    </div>
  );
}
