import { Radar, Search, CalendarClock, ExternalLink, MapPin, MessageSquareText, RotateCcw, Building2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePortalContext } from "@/lib/portal/auth";
import { FUNDING_TYPE_LABELS, FUNDING_TYPE_OPTIONS, WATCH_STATUS_LABELS } from "@/features/watch/constants";
import { fundingSearchScore } from "@/features/watch/search";
import { assessRelevance, buildNeedProfile } from "@/features/watch/relevance";
import { extractProjectSignals, scoreOpportunityForProject, type OpportunityForMatch, type ProjectMatchResult } from "@/features/watch/projectMatch";
import { clientOpportunityInterestsService } from "@/server/services/clientOpportunityInterests.service";
import { SendInterestForm } from "./SendInterestForm";

// Version portail de /watch (src/app/(dashboard)/watch/page.tsx) -- Jade a demandé que ça
// fonctionne « exactement comme le portail admin, juste enlever les sources » : mêmes onglets de
// vue, mêmes filtres (audience/type/province/échéance), même moteur de recherche/pertinence
// (features/watch/*) et même présentation de carte -- seulement sans rien lié aux sources
// (funding_sources/funding_opportunity_sources restent staff-only, 0033/0036 -- aucun filtre ni
// badge de source ici).
//
// Volontairement HORS de cette page, même avec cette parité : la recherche web approfondie
// (coûts IA), l'actualisation de la veille, la gestion des sources, l'ajout manuel d'une
// opportunité et le changement de STATUT d'une opportunité -- funding_opportunities est un
// catalogue partagé (même ligne vue par tout le personnel et tous les comptes portail de
// l'organisation) : laisser un client déclarer une opportunité « Ignorée » l'ignorerait pour tout
// le monde, pas juste pour lui. Le portail reste un signal à sens unique : « ça m'intéresse » ->
// notification au personnel (SendInterestForm), jamais une modification du catalogue partagé.
// Même raisonnement pour funding_awards (données sur D'AUTRES bénéficiaires, jamais staff-only ->
// portail) : le matching de projet tourne donc ici sans cette table, comme avant (awards = []).

function formatMoney(value: number | null) {
  if (value == null) return "Non précisé";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}
function formatDate(value: string | null) {
  if (!value) return "En continu / à confirmer";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

type SearchParams = { all?: string; q?: string; project?: string; view?: string; audience?: string; province?: string; funding_type?: string; deadline?: string };

export default async function PortalVeillePage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requirePortalContext();
  const supabase = await createClient();

  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const project = (searchParams?.project ?? "").trim();
  const view = searchParams?.view ?? "active";
  const audience = searchParams?.audience ?? "business";
  const province = searchParams?.province ?? "all";
  const fundingType = searchParams?.funding_type ?? "all";
  const deadline = searchParams?.deadline ?? "all";
  const now = Date.now();
  const showAll = searchParams?.all === "1";

  // Aucun filtre de statut au niveau de la requête (contrairement à l'ancienne version) : comme
  // /watch, tous les statuts sont chargés et le filtrage par onglet de vue se fait plus bas --
  // nécessaire pour que l'onglet « Toutes » montre vraiment tout, comme côté admin.
  const [opportunitiesResult, territoriesResult, changesResult, interests] = await Promise.all([
    supabase.from("funding_opportunities").select("*").order("discovered_at", { ascending: false }),
    supabase.from("funding_opportunity_territories").select("*"),
    // funding_opportunity_changes_select_portal (0055) : ouvert au portail pour cet onglet
    // uniquement (opportunity_id + detected_at, rien de sensible) -- si la migration n'est pas
    // encore appliquée, la RLS renvoie simplement 0 ligne, jamais une erreur.
    supabase.from("funding_opportunity_changes").select("opportunity_id,detected_at").gte("detected_at", new Date(Date.now() - 14 * 86400000).toISOString()),
    clientOpportunityInterestsService(supabase).listByClient(ctx.clientId),
  ]);
  if (opportunitiesResult.error) throw opportunitiesResult.error;
  if (territoriesResult.error) throw territoriesResult.error;
  if (changesResult.error) throw changesResult.error;
  const all = opportunitiesResult.data ?? [];
  const territories = territoriesResult.data ?? [];
  const changed = new Set((changesResult.data ?? []).map((x) => x.opportunity_id));
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

  const scored = withMatch
    .filter(({ item, searchMatch, relevant }) => {
      const qMatch = !q || searchMatch > 0;
      const viewMatch =
        view === "all"
          ? true
          : view === "active"
            ? !["ignored", "archived"].includes(item.status)
            : view === "modified"
              ? changed.has(item.id)
              : view === "opening_soon"
                ? item.availability_status === "opening_soon"
                : item.status === view;
      const audienceMatch =
        audience === "all"
          ? true
          : audience === "business"
            ? ["private_business", "mixed"].includes(item.target_audience) || (item.target_audience === "unknown" && item.business_relevance_score >= 50)
            : item.target_audience === audience;
      const itemTerritories = territories.filter((t) => t.opportunity_id === item.id);
      const provinceMatch = province === "all" || itemTerritories.some((t) => t.province_territory === province);
      const typeMatch = fundingType === "all" || item.funding_type === fundingType;
      let deadlineMatch = true;
      if (deadline !== "all") {
        if (!item.deadline) deadlineMatch = false;
        else {
          const d = new Date(`${item.deadline}T23:59:59`).getTime();
          deadlineMatch = d >= now && d <= now + Number(deadline) * 86400000;
        }
      }
      const projectMatch = !project || showAll || relevant;
      return qMatch && viewMatch && audienceMatch && provinceMatch && typeMatch && deadlineMatch && projectMatch;
    })
    .sort((a, b) => {
      if (project) return (b.matchResult?.score ?? 0) - (a.matchResult?.score ?? 0);
      if (q) return b.searchMatch - a.searchMatch;
      return (b.item.business_relevance_score ?? 0) - (a.item.business_relevance_score ?? 0);
    });

  // Diagnostic UX : la recherche/le projet trouve des programmes, mais un filtre additionnel les
  // masque -- même aide que sur /watch, pour éviter un « aucun résultat » trompeur.
  const lexicalMatches = q
    ? withMatch.filter((x) => x.searchMatch > 0).map((x) => x.item)
    : project
      ? withMatch.filter((x) => x.relevant).map((x) => x.item)
      : [];

  const opportunities = scored.map((x) => x.item);
  const matchById = new Map(scored.map((x) => [x.item.id, x.matchResult]));
  const provinces = unique(territories.map((x) => x.province_territory));

  // Construit l'URL d'un lien de filtre/onglet en repartant de l'état courant -- chaque lien ne
  // passe QUE ce qu'il change (overrides), le reste vient de l'état déjà actif. Une valeur égale à
  // la valeur par défaut de son champ n'est jamais écrite dans l'URL (garde les liens courts et
  // stables), donc la comparaison se fait contre DEFAULTS, pas contre le littéral "all" -- `view`
  // a "active" comme défaut, pas "all" (qui est une vue distincte, "Toutes").
  const DEFAULTS: Record<string, string> = { view: "active", audience: "business", province: "all", funding_type: "all", deadline: "all" };
  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = { view, audience, province, funding_type: fundingType, deadline, q: searchParams?.q, project, all: showAll ? "1" : undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      if (DEFAULTS[k] === v) continue;
      params.set(k, v);
    }
    return params.toString();
  };

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
        <input type="hidden" name="view" value={view} />
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
                <Link href={`/portal/veille?${qs({ project: undefined, all: undefined })}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">
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
          Affichage de tous les programmes, triés par pertinence, y compris ceux sans rapport clair avec ton projet.{" "}
          <Link href={`/portal/veille?${qs({ all: undefined })}`} className="ml-1 font-semibold underline">
            Revenir aux programmes pertinents
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ViewTab href={`/portal/veille?${qs({ view: "active" })}`} active={view === "active"}>Actives</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "new" })}`} active={view === "new"}>Nouvelles</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "to_review" })}`} active={view === "to_review"}>À analyser</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "qualified" })}`} active={view === "qualified"}>Pertinentes</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "modified" })}`} active={view === "modified"}>Modifiées</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "opening_soon" })}`} active={view === "opening_soon"}>Ouverture bientôt</ViewTab>
        <ViewTab href={`/portal/veille?${qs({ view: "all" })}`} active={view === "all"}>Toutes</ViewTab>
      </div>

      <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="view" value={view} />
        {project && <input type="hidden" name="project" value={project} />}
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input name="q" defaultValue={searchParams?.q} placeholder="Rechercher stage, formation, exportation, équipement…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
          </label>
          <Select name="audience" defaultValue={audience} first="Entreprises">
            <option value="business">Entreprises</option>
            <option value="mixed">Mixte</option>
            <option value="nonprofit">OBNL / communautaire</option>
            <option value="municipality">Municipal</option>
            <option value="individual">Particuliers</option>
            <option value="public_body">Organismes publics</option>
            <option value="all">Tout afficher</option>
          </Select>
          <Select name="funding_type" defaultValue={fundingType} first="Tous les types">
            {FUNDING_TYPE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white">
            <Search className="h-4 w-4" />
            Rechercher
          </button>
        </div>
        <details className="rounded-xl bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Filtres avancés</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Select name="province" defaultValue={province} first="Toutes les provinces">
              {provinces.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
            <Select name="deadline" defaultValue={deadline} first="Toutes les échéances">
              <option value="30">Dans 30 jours</option>
              <option value="60">Dans 60 jours</option>
              <option value="90">Dans 90 jours</option>
            </Select>
          </div>
        </details>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>{opportunities.length} opportunité{opportunities.length > 1 ? "s" : ""} affichée{opportunities.length > 1 ? "s" : ""}</span>
        <span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" />Les programmes OBNL, municipaux et individuels sont masqués par défaut.</span>
      </div>

      {opportunities.length === 0 && lexicalMatches.length > 0 && (q || project) && (fundingType !== "all" || province !== "all" || deadline !== "all" || audience !== "business" || view !== "active") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{lexicalMatches.length} programme{lexicalMatches.length > 1 ? "s" : ""} correspond{lexicalMatches.length > 1 ? "ent" : ""}</strong> à ta recherche, mais les filtres actuels les masquent.{" "}
          <Link href={`/portal/veille?${qs({ audience: "business", province: undefined, funding_type: undefined, deadline: undefined })}`} className="ml-1 font-semibold underline">
            Réinitialiser les filtres et voir les résultats
          </Link>
          .
        </div>
      )}

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
                <Link href={`/portal/veille?${qs({ all: "1" })}`} className="font-semibold underline">
                  affiche tous les programmes triés par pertinence
                </Link>
                .
              </>
            ) : (
              "Essaie une recherche plus large, ou une autre vue ci-dessus."
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
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">{WATCH_STATUS_LABELS[item.status] ?? item.status}</span>
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
    </div>
  );
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "fr"));
}
function ViewTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={active ? "rounded-full bg-slate-950 px-3.5 py-2 text-sm font-medium text-white" : "rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600"}>
      {children}
    </Link>
  );
}
function Select({ name, defaultValue, first, children }: { name: string; defaultValue: string; first: string; children: React.ReactNode }) {
  return (
    <select name={name} defaultValue={defaultValue} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
      <option value="all">{first}</option>
      {children}
    </select>
  );
}
