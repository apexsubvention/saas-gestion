"use client";

import { useState, useTransition } from "react";
import { MessageCircleQuestion, Loader2 } from "lucide-react";
import { askProgramAction } from "./askActions";
import { safeHref } from "@/lib/errors";
import type { QaAnswer } from "@/features/programs/qa/ask";
import type { QaHistoryRow } from "@/server/services/programQa.service";

const SUGGESTIONS = [
  "Est-ce que les voyages sont admissibles ?",
  "Puis-je engager un sous-traitant américain ?",
  "Quel est le maximum ?",
  "Les dépenses peuvent-elles commencer avant l'acceptation ?",
  "Quel est le taux de financement ?",
  "Quels documents faut-il préparer ?",
  "Le salaire du dirigeant est-il admissible ?",
  "Peut-on cumuler cette subvention avec une autre ?",
  "Est-ce que mon projet pourrait cadrer avec ce programme ?",
];

const KIND_LABELS: Record<string, string> = { official_page: "Page officielle", guide_pdf: "Guide officiel (PDF)", apex_sheet: "Fiche Apex", client_info: "Information client" };

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function AnswerView({ answer }: { answer: QaAnswer }) {
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">
        {answer.segments.map((s, i) => (
          <span key={i}>
            <Bold text={s.text} />
            {s.sources.map((n) => <sup key={n} className="ml-0.5 font-semibold text-indigo-600">[{n}]</sup>)}
          </span>
        ))}
      </div>
      {answer.sources.length > 0 ? (
        <div className="rounded-md bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Sources</p>
          <ol className="space-y-2 text-xs text-neutral-600">
            {answer.sources.map((s) => {
              const href = safeHref(s.url);
              return (
                <li key={s.n}>
                  <span className="font-semibold text-indigo-600">[{s.n}]</span> {KIND_LABELS[s.kind] ?? s.kind} —{" "}
                  {href ? <a href={href} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline">{s.title}</a> : s.title}
                  {s.page && <span className="font-medium"> · {s.page}</span>}
                  {s.quote && <blockquote className="mt-0.5 border-l-2 border-neutral-300 pl-2 italic text-neutral-500">« {s.quote} »</blockquote>}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-amber-800">Cette réponse ne cite aucune source : ne la considère pas comme confirmée.</p>
      )}
      {answer.skippedGuides.length > 0 && (
        <p className="text-xs text-amber-800">Guide(s) non consulté(s) : {answer.skippedGuides.map((g) => `${g.label} (${g.reason})`).join(" ; ")}</p>
      )}
      <p className="text-xs text-neutral-400">
        Réponse générée à partir des documents du programme{answer.usedGuides.length > 0 ? ` et de ${answer.usedGuides.length} guide(s) PDF` : ""} — à vérifier auprès du programme avant de la donner à un client.
      </p>
    </div>
  );
}

export function AskProgramPanel({
  programId,
  clients,
  guideCount,
  history,
  configured,
}: {
  programId: string;
  clients: Array<{ id: string; name: string }>;
  guideCount: number;
  history: QaHistoryRow[];
  configured: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [clientId, setClientId] = useState("");
  const [guides, setGuides] = useState(guideCount > 0);
  const [answer, setAnswer] = useState<QaAnswer | null>(null);
  const [asked, setAsked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  function ask() {
    setError(null);
    setAnswer(null);
    setAsked(question.trim());
    startTransition(async () => {
      const r = await askProgramAction(programId, question, clientId || null, guides);
      if (r.ok) setAnswer(r.answer);
      else setError(r.error);
    });
  }

  if (!configured) {
    return <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">L&apos;assistant nécessite la variable <code className="rounded bg-neutral-100 px-1">ANTHROPIC_API_KEY</code> dans Vercel.</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-600 p-2 text-white"><MessageCircleQuestion className="h-5 w-5" /></div>
        <p className="text-sm text-neutral-600">Pose une question précise. La réponse vient uniquement des documents du programme (pages officielles, guides, fiche Apex) et cite ses sources. Si l&apos;information n&apos;y est pas, l&apos;assistant le dit : il n&apos;invente aucune règle.</p>
      </div>

      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1500} placeholder="Ex. Les billets d'avion sont-ils admissibles ?" className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => setQuestion(s)} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50">{s}</button>)}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-xs text-neutral-500">Dans le contexte d&apos;un client (facultatif)
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="block rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800">
            <option value="">Aucun client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {guideCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            Consulter aussi {guideCount > 1 ? `les ${guideCount} guides PDF officiels` : "le guide PDF officiel"} (plus précis, plus long)
          </label>
        )}
        <button onClick={ask} disabled={pending || question.trim().length < 3} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Recherche dans les documents…" : "Poser la question"}</button>
      </div>

      {pending && <p className="flex items-center gap-2 text-sm text-neutral-600"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> Lecture des documents du programme — jusqu&apos;à une minute avec les guides PDF.</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {answer && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">{asked}</p>
          <AnswerView answer={answer} />
        </div>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">Questions précédentes ({history.length})</summary>
          <ul className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-neutral-200 bg-white p-3">
                <button className="w-full text-left text-sm font-medium text-neutral-800" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
                  {h.question} <span className="ml-1 text-xs font-normal text-neutral-400">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(new Date(h.created_at))}</span>
                </button>
                {openId === h.id && <div className="mt-2"><AnswerView answer={h.answer} /></div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
