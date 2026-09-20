"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Globe, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { addWebResultAsProgramAction, runDeepSearchAction, type AddWebProgramState } from "./deepSearchActions";
import { safeHref } from "@/lib/errors";
import type { DeepSearchResult, WebProgramResult } from "@/features/watch/webSearch/types";

const AVAILABILITY: Record<string, { label: string; className: string }> = {
  open: { label: "Ouvert", className: "bg-emerald-50 text-emerald-700" },
  opening_soon: { label: "Ouverture bientôt", className: "bg-amber-50 text-amber-700" },
  continuous: { label: "En continu", className: "bg-emerald-50 text-emerald-700" },
  closed: { label: "Fermé (piste récurrente)", className: "bg-slate-100 text-slate-600" },
  unknown: { label: "Ouverture à confirmer", className: "bg-slate-100 text-slate-500" },
};
const CONFIDENCE: Record<string, { label: string; className: string }> = {
  high: { label: "Correspondance forte", className: "bg-violet-100 text-violet-800" },
  medium: { label: "Piste probable", className: "bg-violet-50 text-violet-700" },
  low: { label: "Piste éloignée", className: "bg-slate-100 text-slate-600" },
};

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
      {pending ? "Lecture de la page…" : "Ajouter aux programmes"}
    </button>
  );
}

function AddToPrograms({ program }: { program: WebProgramResult }) {
  const [state, action] = useFormState<AddWebProgramState, FormData>(addWebResultAsProgramAction, { error: null });
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="name" value={program.name} />
      <input type="hidden" name="url" value={program.url} />
      <input type="hidden" name="organization" value={program.organization ?? ""} />
      <input type="hidden" name="summary" value={program.summary} />
      <AddButton />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function ProgramCard({ program }: { program: WebProgramResult }) {
  const href = safeHref(program.url);
  const availability = AVAILABILITY[program.availability] ?? AVAILABILITY.unknown!;
  const confidence = CONFIDENCE[program.confidence] ?? CONFIDENCE.low!;
  const facts = [
    program.funding_type && ["Type", program.funding_type],
    program.rate_text && ["Taux", program.rate_text],
    program.amount_text && ["Montant", program.amount_text],
    program.deadline_text && ["Dépôt", program.deadline_text],
  ].filter(Boolean) as Array<[string, string]>;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${confidence.className}`}>{confidence.label}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${availability.className}`}>{availability.label}</span>
      </div>
      <h3 className="font-semibold text-slate-950">{program.name}</h3>
      {program.organization && <p className="text-sm text-slate-500">{program.organization}</p>}
      <p className="mt-3 text-sm leading-6 text-slate-600">{program.summary}</p>
      <p className="mt-2 flex gap-1.5 text-sm text-emerald-800"><span>✓</span><span>{program.why_it_fits}</span></p>
      {program.eligibility_to_verify && <p className="mt-1 flex gap-1.5 text-sm text-amber-800"><span>?</span><span>À vérifier : {program.eligibility_to_verify}</span></p>}
      {facts.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {facts.map(([k, v]) => <div key={k}><dt className="inline text-slate-400">{k} : </dt><dd className="inline font-medium">{v}</dd></div>)}
        </dl>
      )}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <AddToPrograms program={program} />
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
            <ExternalLink className="h-3.5 w-3.5" /> Voir la page officielle
          </a>
        )}
      </div>
    </article>
  );
}

export function DeepWebSearch({
  project,
  initial,
  autoStart,
  configured,
  noLocalResults,
}: {
  project: string;
  initial: DeepSearchResult | null;
  autoStart: boolean;
  configured: boolean;
  noLocalResults: boolean;
}) {
  const [result, setResult] = useState<DeepSearchResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  function start(force: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await runDeepSearchAction(project, force);
      if (r.ok) setResult(r.result);
      else setError(r.error);
    });
  }

  // Lancement automatique quand rien ne correspond dans le catalogue et qu'aucun résultat
  // récent n'est en cache. Le garde évite le double appel du mode Strict de React.
  useEffect(() => {
    if (autoStart && configured && !initial && !started.current) {
      started.current = true;
      start(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!configured) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        <div className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><Globe className="h-4 w-4" /> Recherche web approfondie</div>
        La recherche web n&apos;est pas activée : ajoute la variable <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code> dans Vercel, puis redéploie.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-950"><Globe className="h-4 w-4 text-indigo-600" /> Recherche web approfondie</div>
          <p className="mt-1 text-sm text-slate-600">
            {noLocalResults ? "Aucun programme de la veille ne correspond à ce projet : Apex cherche sur le web, en français et en anglais, en commençant par les sources officielles." : "Apex cherche sur le web des programmes supplémentaires, en commençant par les sources officielles."}
          </p>
        </div>
        {!pending && (
          <button onClick={() => start(!!result)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700">
            {result ? <><RefreshCw className="h-3.5 w-3.5" /> Relancer la recherche</> : <><Globe className="h-3.5 w-3.5" /> Lancer la recherche web</>}
          </button>
        )}
      </div>

      {pending && (
        <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> Recherche en cours sur le web… cela peut prendre jusqu&apos;à une minute.
        </p>
      )}
      {error && !pending && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && !pending && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {result.programs.length} programme(s) trouvé(s) · {result.searchesUsed} recherche(s) web · {new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeStyle: "short" }).format(new Date(result.searchedAt))}.
            Résultats issus d&apos;une recherche automatisée : à vérifier sur la page officielle avant d&apos;en parler à un client.
          </p>
          {result.programs.length === 0 && (
            <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-700">Aucun programme précis n&apos;a été trouvé pour ce projet.</p>
          )}
          <div className="grid gap-4 xl:grid-cols-2">{result.programs.map((p) => <ProgramCard key={p.url} program={p} />)}</div>
          {result.notes && <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-700"><span className="font-medium">Pistes complémentaires : </span>{result.notes}</p>}
          {result.droppedUnverified > 0 && (
            <p className="text-xs text-slate-400">{result.droppedUnverified} résultat(s) écarté(s) car leur source n&apos;a pas pu être vérifiée dans les pages consultées.</p>
          )}
          {result.sources.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Pages consultées ({result.sources.length})</summary>
              <ul className="mt-2 space-y-1">
                {result.sources.map((s) => {
                  const href = safeHref(s.url);
                  return href ? <li key={s.url} className="truncate"><a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{s.title}</a></li> : null;
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
