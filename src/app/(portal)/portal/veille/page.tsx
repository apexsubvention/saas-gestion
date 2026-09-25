import { Radar, Search, CalendarClock, ExternalLink, MapPin, MessageSquareText, RotateCcw, DatabaseZap } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePortalContext } from "@/lib/portal/auth";
import { FUNDING_TYPE_LABELS } from "@/features/watch/constants";
import { fundingSearchScore } from "@/features/watch/search";
import { assessRelevance, buildNeedProfile } from "@/features/watch/relevance";
import { extractProjectSignals, scoreOpportunityForProject, type OpportunityForMatch, type ProjectMatchResult } from "@/features/watch/projectMatch";
import { clientOpportunityInterestsRepository } from "@/server/repositories/clientOpportunityInterests.repository";
import { SendInterestForm } from "./SendInterestForm";

// Version portail de /watch (src/app/(dashboard)/watch/page.tsx), en lecture pour le client :
// même moteur de recherche/pertinence (features/watch/*, funding_opportunities déjà lisible par un
// compte portail -- voir la note de 0033_client_program_links.sql). Volontairement HORS de cette
// page : la recherche web approfondie (coûts IA), l'actualisation de la veille, la gestion des
// sources et le changement de statut d'une opportunité -- tout ça reste réservé au personnel dans
// /watch. Le portail est un signal à sens unique : « ça m'intéresse » -> notification au personnel.

function formatMoney(value: number | null) {
  if (value == null) return "Non précisé";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}
function formatDate(value: string | null) {
  if (!value) return "En continu / à confirmer";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

type SearchParams = { q?: string; project?: string; all?: string };

export default async function PortalVeillePage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requirePortalContext();
  const supabase = await createClient();

  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const project = (searchParams?.project ?? "").trim();
  const showAll = searchParams?.all === "1";

  const [opportunitiesResult, territoriesResult, interests] = await Promise.all([
    supabase
      .from("funding_opportunities")
      .select("*")
      .not("status", "in", '("ignored","archived")')
      .order("business_relevance_score", { ascending: false }),
    supabase.from("funding_opportunity_territories").select("*"),
    clientOpportunityInterestsRepository(supabase).listByClient(ctx.clientId),
  ]);
  if (opportunitiesResult.error) throw opportunitiesResult.error;
  if (territoriesResult.error) throw territoriesResult.error;
  const all = opportunitiesResult.data ?? [];
  const territories = territoriesResult.data ?? [];
  const interestByOpportunity = new Map(interests.map((i) => [i.opportunity_id, i]));

  const projectSignals = project ? extractProjectSignals(project) : null;
  function matchProject(item: (typeof all)[number]): ProjectMatchResult | null {
    if (!projectSignals) return null;
    return scoreOpportunityForProject(projectSignals, item as unknown as OpportunityForMatch, []);
  }

  const needProfile = project ? buildNeedProfile(project) : null;
  const focusText = (i: (typeof all)[number]) =>
    [i.title, i.summary, i.organization, (i.categories ?? []).join(" "), (i.eligible_sectors ?? []).join(" "), (i.eligible_expenses ?? []).join(" "), i.eligibility_criteria, (i.search_aliases ?? []).join(" "), (i.government_priorities ?? []).join(" ")].filter(Boolean).join(" ");

  const withMatch = all.map((item) => ({
    item,
    matchResult: matchProject(item),
    searchMatch: fundingSearchScore(q, item),
    relevant: needProfile ? assessRelevance(needProfile, focusText(item)).relevant : true,
  }));

  // Par défaut, seulement les programmes pertinents pour une entreprise -- une nuance interne
  // (audience "business" côté admin) qui n'a pas besoin d'un filtre visible ici.
  const businessRelevant = (item: (typeof all)[number]) =>
    ["private_business", "mixed"].includes(item.target_audience) || (item.target_audience === "unknown" && item.business_relevance_score >= 50);

  const scored = withMatch
    .filter(({ item, searchMatch, relevant }) => {
      const qMatch = !q || searchMatch > 0;
      const projectMatch = !project || showAll || relevant;
      return qMatch && projectMatch && businessRelevant(item);
    })
    .sort((a, b) => {
      if (project) return (b.matchResult?.score ?? 0) - (a.matchResult?.score ?? 0);
      if (q) return b.searchMatch - a.searchMatch;
      return (b.item.business_relevance_score ?? 0) - (a.item.business_relevance_score ?? 0);
    });

  const opportunities = scored.map((x) => x.item);
  const matchById = new Map(scored.map((x) => [x.item.id, x.matchResult]));

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
          <Radar className="h-4 w-4" /> Veille
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Subventions et aides disponibles</h1>
        <p className="mt-1 text-sm text-slate-500">
          Le catalogue d&apos;aides suivi par Apex. Trouve un programme qui t&apos;intéresse et signale-le : Apex en sera avisé.
        </p>
      </div>

      <form className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5 text-white">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-950">Décris ton besoin</div>
            <p className="mt-1 text-sm text-slate-600">
              Ex. « Formation de 6 employés et implantation d&apos;un CRM à 40 000 $. » Apex compare le catalogue à ce que tu décris.
            </p>
            <textarea
              name="project"
              defaultValue={project}
              rows={3}
              className="mt-3 w-full rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300"
              placeholder="Décris ton projet, le budget et ce que tu veux accomplir…"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
                Trouver les aides compatibles
              </button>
              {project && (
                <Link href="/portal/veille" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">
                  <RotateCcw className="h-4 w-4" />
                  Effacer
                </Link>
              )}
            </div>
          </div>
        </div>
      </form>

      {project && showAll && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Affichage de tous les programmes, triés par pertinence.{" "}
          <Link href={`/portal/veille?project=${encodeURIComponent(project)}`} className="ml-1 font-semibold underline">
            Revenir aux programmes pertinents
          </Link>
        </div>
      )}

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {project && <input type="hidden" name="project" value={project} />}
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            name="q"
            defaultValue={searchParams?.q}
            placeholder="Ou cherche un mot-clé : stage, formation, exportation, équipement…"
            className="w-full bg-transparent py-2.5 text-sm outline-none"
          />
        </label>
      </form>

      <p className="text-sm text-slate-500">
        {opportunities.length} opportunité{opportunities.length > 1 ? "s" : ""} affichée{opportunities.length > 1 ? "s" : ""}
      </p>

      {opportunities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Radar className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-900">
            {project ? "Aucun programme du catalogue ne correspond à ce projet" : "Aucune opportunité trouvée"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {project ? (
              <>
                Essaie une description différente, ou{" "}
                <Link href={`/portal/veille?project=${encodeURIComponent(project)}&all=1`} className="font-semibold underline">
                  affiche tous les programmes triés par pertinence
                </Link>
                .
              </>
            ) : (
              "Essaie une recherche plus large."
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {opportunities.map((item) => {
            const tr = territories.find((t) => t.opportunity_id === item.id);
            const projectMatch = matchById.get(item.id) ?? null;
            const existingInterest = interestByOpportunity.get(item.id) ?? null;
            return (
              <article key={item.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2">
                      {item.funding_type && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px]">{FUNDING_TYPE_LABELS[item.funding_type] ?? item.funding_type}</span>
                      )}
                      {item.availability_status === "opening_soon" && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Ouverture bientôt</span>
                      )}
                      {item.availability_status === "open" && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Ouvert</span>
                      )}
                      {projectMatch && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            projectMatch.priorityLabel === "Prioritaire" ? "bg-violet-100 text-violet-800" : projectMatch.priorityLabel === "À évaluer" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {projectMatch.priorityLabel} · {projectMatch.score}/100
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-950">{item.title ?? "Sans titre"}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.organization ?? "Organisme à préciser"}</p>
                  </div>
                  {(item.official_url || item.external_url) && (
                    <a href={item.official_url ?? item.external_url ?? "#"} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-slate-500">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>

                {item.summary && <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary}</p>}

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {tr?.province_territory ?? item.territory ?? "À préciser"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-400">Financement max.</div>
                    <div className="mt-0.5 font-semibold">{formatMoney(item.max_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Taux max.</div>
                    <div className="mt-0.5 font-semibold">{item.funding_rate_max != null ? `${Number(item.funding_rate_max).toLocaleString("fr-CA")} %` : "Non précisé"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">{item.availability_status === "opening_soon" ? "Ouverture prévue" : "Échéance"}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatDate(item.availability_status === "opening_soon" ? item.expected_open_date : item.deadline)}
                    </div>
                  </div>
                </div>

                {projectMatch && (projectMatch.reasons.length > 0 || projectMatch.criteriaToVerify.length > 0) && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
                    {projectMatch.reasons.slice(0, 3).map((reason, i) => (
                      <p key={`r${i}`} className="flex items-start gap-1.5 text-emerald-800">
                        <span className="mt-0.5">✓</span>
                        <span>{reason}</span>
                      </p>
                    ))}
                    {projectMatch.criteriaToVerify.slice(0, 3).map((concern, i) => (
                      <p key={`c${i}`} className="flex items-start gap-1.5 text-amber-800">
                        <span className="mt-0.5">?</span>
                        <span>{concern}</span>
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <SendInterestForm opportunityId={item.id} alreadySentStatus={existingInterest?.status ?? null} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <DatabaseZap className="h-3.5 w-3.5" />
        Catalogue maintenu par Apex à partir de sources publiques -- mis à jour régulièrement.
      </p>
    </div>
  );
}
