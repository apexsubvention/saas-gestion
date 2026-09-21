import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { programsService } from "@/server/services/programs.service";
import { safeHref } from "@/lib/errors";
import { supportsOpenCanadaAwards } from "@/features/watch/connectors/openCanadaAwards";
import { EditProgramForm } from "./EditProgramForm";
import { AskProgramPanel } from "./AskProgramPanel";
import { programQaService } from "@/server/services/programQa.service";
import { clientsService } from "@/server/services/clients.service";
import { guideCandidates } from "@/features/programs/qa/bundle";
import { qaAvailable } from "@/features/programs/qa/ask";
import { findOpenCanadaExamplesAction, rereadProgramAction } from "./actions";

// « Relire la page » télécharge et analyse plusieurs pages : plus long qu'un rendu normal.
export const maxDuration = 60;

const AVAILABILITY_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Ouvert", className: "bg-emerald-50 text-emerald-700" },
  opening_soon: { label: "Ouverture bientôt", className: "bg-amber-50 text-amber-700" },
  continuous: { label: "En continu", className: "bg-emerald-50 text-emerald-700" },
  closed: { label: "Fermé", className: "bg-neutral-100 text-neutral-600" },
  unknown: { label: "Disponibilité à confirmer", className: "bg-neutral-100 text-neutral-500" },
};

const LINK_KIND_LABELS: Record<string, string> = { guide: "Guide", formulaire: "Formulaire", exemple: "Exemples", autre: "Document" };

// Codes de retour posés par les actions (voir actions.ts) -> texte affiché.
function noticeText(code: string | undefined): { text: string; tone: "ok" | "warn" } | null {
  if (!code) return null;
  const added = code.match(/^examples_added_(\d{1,3})$/);
  if (added) return { text: `${added[1]} exemple(s) de projets financés ajouté(s).`, tone: "ok" };
  switch (code) {
    case "reread_ok": return { text: "Page relue : la fiche a été mise à jour.", tone: "ok" };
    case "reread_partial": return { text: "Page relue, mais seulement en partie : vérifie les champs ci-dessous.", tone: "warn" };
    case "url_read_ok": return { text: "Modifications enregistrées et page lue : les champs vides ont été complétés avec les informations trouvées (ce que tu avais saisi n'a pas été modifié).", tone: "ok" };
    case "url_read_partial": return { text: "Modifications enregistrées. La page a été lue seulement en partie : vérifie les champs et complète-les à la main si besoin.", tone: "warn" };
    case "url_read_failed": return { text: "Modifications enregistrées, mais la page n'a pas pu être lue (voir le détail dans « Lecture de la page source »).", tone: "warn" };
    case "reread_failed": return { text: "La page n'a pas pu être relue (voir le détail ci-dessous).", tone: "warn" };
    case "examples_none": return { text: "Aucun exemple correspondant trouvé dans les subventions ouvertes du Canada.", tone: "warn" };
    case "examples_unsupported": return { text: "La recherche d'exemples dans les données ouvertes du Canada n'est pas disponible pour ce programme.", tone: "warn" };
    case "examples_failed": return { text: "La recherche d'exemples a échoué. Réessaie plus tard.", tone: "warn" };
    default: return null;
  }
}

function money(n: number | null) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}
function percent(rate: number | null) {
  return rate == null ? "—" : `${(Math.round(rate * 10000) / 100).toLocaleString("fr-CA")} %`;
}
function day(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function TextSection({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="whitespace-pre-line text-sm text-neutral-700">{text}</p>
    </section>
  );
}

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { notice?: string };
}) {
  const supabase = await createClient();
  const service = programsService(supabase);
  const program = await service.get(params.id);
  if (!program) notFound();
  const examples = await service.listExamples(program.id);
  const [qaHistory, allClients] = await Promise.all([programQaService(supabase).list(program.id), clientsService(supabase).list()]);

  const availability = AVAILABILITY_LABELS[program.availability_status] ?? AVAILABILITY_LABELS.unknown!;
  const notice = noticeText(searchParams?.notice);
  const sourceHref = safeHref(program.source_url);
  const canSearchOpenCanada = supportsOpenCanadaAwards(`${program.name} ${program.agency ?? ""}`);
  const documents = program.required_documents ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/programs" className="text-sm text-neutral-500 hover:text-neutral-900">← Programmes</Link>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${availability.className}`}>{availability.label}</span>
          {program.program_type && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{program.program_type}</span>}
          {program.territory && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{program.territory}</span>}
        </div>
        <h1 className="text-lg font-semibold text-neutral-900">{program.name}</h1>
        {program.agency && <p className="text-sm text-neutral-600">{program.agency}</p>}
        {program.description && <p className="text-sm text-neutral-700">{program.description}</p>}
        {sourceHref && (
          <a href={sourceHref} target="_blank" rel="noreferrer" className="block break-all text-sm text-blue-600 hover:underline">
            {sourceHref}
          </a>
        )}
      </div>

      {notice && (
        <p className={`rounded-md px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{notice.text}</p>
      )}

      {program.source_url && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-neutral-900">Lecture de la page source</p>
            {program.last_read_at ? (
              <p className="text-neutral-600">
                Dernière lecture le {new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeStyle: "short" }).format(new Date(program.last_read_at))}{" "}
                — {program.extraction_method === "llm" ? "analyse par IA" : program.extraction_method === "heuristic" ? "extraction automatique simple" : "aucune donnée extraite"}.
              </p>
            ) : (
              <p className="text-neutral-600">La page n&apos;a pas encore été lue.</p>
            )}
            {program.read_error && <p className="text-amber-800">{program.read_error}</p>}
            <p className="text-xs text-neutral-400">
              Les informations extraites automatiquement doivent être vérifiées sur la page officielle avant d&apos;être utilisées avec un client.
              Relire la page complète les champs trouvés sans effacer les autres.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={rereadProgramAction.bind(null, program.id)}>
              <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Relire la page</button>
            </form>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Aide financière et dépôt</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="% remboursé (max.)" value={percent(program.typical_aid_rate)} />
          <Stat label="Montant maximal" value={money(program.max_aid_amount)} />
          <Stat label="Dépenses minimales" value={money(program.min_eligible_spend)} />
          <Stat label="Ouverture des dépôts" value={day(program.open_date)} />
          <Stat label="Date limite de dépôt" value={day(program.deadline)} />
          <Stat label="Périodes de dépôt" value={program.filing_notes ?? "—"} />
        </div>
      </section>

      <div className="space-y-5 rounded-lg border border-neutral-200 bg-white p-6">
        <TextSection title="Formule d'aide" text={program.aid_notes} />
        <TextSection title="Dépenses admissibles" text={program.eligible_expenses} />
        <TextSection title="Dépenses non admissibles" text={program.ineligible_expenses} />
        <TextSection title="Processus de demande" text={program.application_process} />
        {documents.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900">Documents à préparer pour rédiger la demande</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
              {documents.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </section>
        )}
        <TextSection title="Réclamation / remboursement" text={program.claim_process} />
        {program.government_priorities.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900">Priorités du programme</h3>
            <div className="flex flex-wrap gap-2">
              {program.government_priorities.map((p) => <span key={p} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">{p}</span>)}
            </div>
          </section>
        )}
        {!program.aid_notes && !program.eligible_expenses && !program.application_process && !program.claim_process && documents.length === 0 && (
          <p className="text-sm text-neutral-400">Aucun détail renseigné pour l&apos;instant. Utilise « Modifier la fiche » ci-dessous ou relis la page source.</p>
        )}
      </div>

      {program.resource_links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-900">Guides, formulaires et documents utiles</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {program.resource_links.map((l) => {
              const href = safeHref(l.url);
              if (!href) return null;
              return (
                <li key={l.url} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-400">{LINK_KIND_LABELS[l.kind] ?? "Document"}</span>
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 truncate text-blue-600 hover:underline">{l.label || href}</a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Exemples de projets financés</h2>
          {canSearchOpenCanada && (
            <form action={findOpenCanadaExamplesAction.bind(null, program.id)}>
              <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700">
                Chercher dans les subventions ouvertes du Canada
              </button>
            </form>
          )}
        </div>
        {examples.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-400">
            Aucun exemple pour l&apos;instant. Ils sont repris de la page du programme quand elle en cite ; sinon ils restent à ajouter.
          </p>
        ) : (
          <ul className="space-y-2">
            {examples.map((e) => {
              const href = safeHref(e.source_url);
              return (
                <li key={e.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900">{e.title}</p>
                    {e.amount != null && <span className="text-sm font-semibold text-neutral-900">{money(e.amount)}</span>}
                  </div>
                  {(e.recipient_name || e.location) && <p className="text-xs text-neutral-500">{[e.recipient_name, e.location].filter(Boolean).join(" · ")}</p>}
                  {e.description && <p className="mt-1 line-clamp-3 text-sm text-neutral-700">{e.description}</p>}
                  <p className="mt-1 text-xs text-neutral-400">
                    {e.source_kind === "open_canada" ? "Subventions ouvertes du Canada" : "Page du programme"}
                    {href && <> · <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">source</a></>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">Pose-moi tes questions sur ce programme</h2>
        <AskProgramPanel
          programId={program.id}
          clients={allClients.map((c) => ({ id: c.id, name: c.name }))}
          guideCount={guideCandidates(program).length}
          history={qaHistory}
          configured={qaAvailable()}
        />
      </section>

      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800">Modifier la fiche</summary>
        <div className="mt-4">
          <EditProgramForm program={program} />
        </div>
      </details>
    </div>
  );
}
