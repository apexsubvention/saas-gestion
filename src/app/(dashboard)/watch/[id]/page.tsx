import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, DatabaseZap, ExternalLink, History, Link2, MapPin, ClipboardList, RefreshCw, Landmark, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { FUNDING_TYPE_LABELS, SOURCE_FAMILY_LABELS, WATCH_STATUS_LABELS } from "@/features/watch/constants";
import { addOpportunityTerritory, linkOpportunitySource, refreshFundingAwardExamples, refreshOpportunityOfficialDetails } from "./actions";
import { updateOpportunityStatus } from "../actions";

function formatMoney(value: number | null) {
  if (value == null) return "Non précisé";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}
function formatPercent(value: number | null) { return value == null ? "Non précisé" : `${Number(value).toLocaleString("fr-CA")} %`; }
function formatDate(value: string | null) {
  if (!value) return "Non précisée";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function formatDateTime(value: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function FundingOpportunityDetailPage({ params }: { params: { id: string } }) {
  await requireOrgContext();
  const supabase = await createClient();

  const [opportunityResult, sourcesResult, linksResult, territoriesResult, changesResult, awardsResult] = await Promise.all([
    supabase.from("funding_opportunities").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("funding_sources").select("*").order("is_official", { ascending: false }).order("name"),
    supabase.from("funding_opportunity_sources").select("*").eq("opportunity_id", params.id).order("last_detected_at", { ascending: false }),
    supabase.from("funding_opportunity_territories").select("*").eq("opportunity_id", params.id).order("created_at"),
    supabase.from("funding_opportunity_changes").select("*").eq("opportunity_id", params.id).order("detected_at", { ascending: false }),
    supabase.from("funding_awards").select("*").eq("opportunity_id", params.id).order("agreement_start_date", { ascending: false }).limit(12),
  ]);

  if (opportunityResult.error) throw opportunityResult.error;
  if (!opportunityResult.data) notFound();
  if (sourcesResult.error) throw sourcesResult.error;
  if (linksResult.error) throw linksResult.error;
  if (territoriesResult.error) throw territoriesResult.error;
  if (changesResult.error) throw changesResult.error;
  if (awardsResult.error) throw awardsResult.error;

  const item = opportunityResult.data;
  const sources = sourcesResult.data ?? [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const officialSource = item.official_source_id ? sourceById.get(item.official_source_id) : null;
  const awards = awardsResult.data ?? [];
  const supportsOpenCanadaExamples = /canexport|pari|irap|industrial research assistance/i.test(`${item.title ?? ""} ${item.organization ?? ""}`);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/watch" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Retour à la veille</Link>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{WATCH_STATUS_LABELS[item.status] ?? item.status}</span>
              {item.funding_type && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{FUNDING_TYPE_LABELS[item.funding_type] ?? item.funding_type}</span>}
              {item.relevance_score != null && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{item.relevance_score}% pertinent</span>}
              {item.availability_status === "opening_soon" && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Ouverture bientôt</span>}
              {item.availability_status === "open" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ouvert</span>}
              {item.availability_status === "closed" && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Fermé</span>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.title ?? "Sans titre"}</h1>
            <p className="mt-1 text-sm text-slate-500">{item.organization ?? "Organisme à préciser"}</p>
            {item.official_page_updated_at && <p className="mt-2 text-xs text-slate-400">Source officielle : {item.official_page_updated_at}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={refreshOpportunityOfficialDetails}><input type="hidden" name="opportunity_id" value={item.id} /><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Relire la fiche officielle</button></form>
            {(item.official_url || item.external_url) && <a href={item.official_url ?? item.external_url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><ExternalLink className="h-4 w-4" /> Ouvrir la source officielle</a>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Financement max." value={formatMoney(item.max_amount)} />
        <InfoCard label="Taux max." value={formatPercent(item.funding_rate_max)} />
        <InfoCard label={item.availability_status === "opening_soon" ? "Ouverture prévue" : "Ouverture"} value={formatDate(item.availability_status === "opening_soon" ? item.expected_open_date : item.open_date)} />
        <InfoCard label="Échéance" value={formatDate(item.deadline)} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      {(item.intake_start_at || item.intake_end_at) && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><CalendarClock className="h-5 w-5" /> Fenêtre de dépôt</div><div className="mt-2 text-sm text-amber-900">{item.intake_start_at ? formatDateTime(item.intake_start_at) : "À confirmer"} → {item.intake_end_at ? formatDateTime(item.intake_end_at) : "À confirmer"}</div></div>}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-6">
          <Section title="Résumé"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.summary || "Aucun résumé enregistré."}</p></Section>

          <Section title="Aide financière" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat label="Financement minimal" value={formatMoney(item.min_amount)} />
              <MiniStat label="Dépenses admissibles minimales" value={formatMoney(item.min_eligible_spend)} />
              <MiniStat label="Apport privé minimal" value={formatPercent(item.private_contribution_min_rate)} />
              <MiniStat label="Cumul gouvernemental max." value={formatPercent(item.stacking_limit_rate)} />
            </div>
            {item.funding_formula && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{item.funding_formula}</p>}
          </Section>

          <Section title="Admissibilité">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.eligibility_criteria || item.eligibility || "Critères à documenter."}</p>
            {(item.eligible_sectors ?? []).length > 0 && <TagBlock label="Secteurs" values={item.eligible_sectors ?? []} />}
            {(item.eligible_expenses ?? []).length > 0 && <TagBlock label="Dépenses admissibles" values={item.eligible_expenses ?? []} />}
            {(item.categories ?? []).length > 0 && <TagBlock label="Catégories" values={item.categories ?? []} />}
          </Section>

          <Section title="Priorités et critères gouvernementaux" icon={<Landmark className="h-4 w-4" />}>
            {(item.government_priorities ?? []).length > 0 ? <TagBlock label="Priorités détectées" values={item.government_priorities ?? []} /> : <p className="text-sm text-slate-500">Aucune priorité explicite n’a encore été extraite.</p>}
            {item.assessment_criteria && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.assessment_criteria}</p>}
          </Section>

          <Section title="Préparer le dossier" icon={<ClipboardList className="h-4 w-4" />}>
            {(item.preparation_documents ?? []).length > 0 ? <div className="space-y-2">{(item.preparation_documents ?? []).map((doc) => <div key={doc} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />{doc}</div>)}</div> : <p className="text-sm text-slate-500">Aucune liste de documents explicite n’a encore été détectée sur la source.</p>}
            {item.preparation_notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.preparation_notes}</p>}
            {item.preparation_source_url && <a href={item.preparation_source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"><ExternalLink className="h-4 w-4" /> Vérifier les exigences sur la source</a>}
          </Section>

          <Section title="Exemples de projets déjà financés" icon={<DatabaseZap className="h-4 w-4" />}>
            {supportsOpenCanadaExamples && <form action={refreshFundingAwardExamples} className="mb-4"><input type="hidden" name="opportunity_id" value={item.id} /><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Actualiser depuis Gouvernement ouvert</button></form>}
            {awards.length === 0 ? <p className="text-sm text-slate-500">{supportsOpenCanadaExamples ? "Aucun exemple encore importé. Clique sur Actualiser pour consulter les divulgations fédérales récentes." : "Aucune bibliothèque publique de projets financés n’est encore connectée pour ce programme."}</p> : <div className="space-y-3">{awards.map((award) => <a key={award.id} href={award.source_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-medium text-slate-900">{award.project_title || award.recipient_name || "Projet financé"}</div><div className="mt-1 text-xs text-slate-500">{award.recipient_name}{award.location ? ` · ${award.location}` : ""}</div></div><div className="text-sm font-semibold text-emerald-700">{formatMoney(award.amount)}</div></div>{award.description && <p className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">{award.description}</p>}<div className="mt-2 text-xs text-slate-400">{formatDate(award.agreement_start_date)} · Gouvernement ouvert</div></a>)}</div>}
          </Section>

          <Section title="Historique des changements" icon={<History className="h-4 w-4" />}>
            {(changesResult.data ?? []).length === 0 ? <p className="text-sm text-slate-500">Aucun changement de programme détecté ou enregistré pour l'instant.</p> : <div className="divide-y divide-slate-100">{(changesResult.data ?? []).map((change) => <div key={change.id} className="py-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-800">{change.summary ?? change.change_type}</span><span className="text-xs text-slate-400">{formatDateTime(change.detected_at)}</span></div>{change.field_name && <div className="mt-1 text-xs text-slate-500">Champ : {change.field_name}</div>}</div>)}</div>}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Source officielle" icon={<DatabaseZap className="h-4 w-4" />}>
            {officialSource ? <div><div className="font-medium text-slate-900">{officialSource.name}</div><div className="mt-1 text-xs text-slate-500">{SOURCE_FAMILY_LABELS[officialSource.source_family] ?? officialSource.source_family}</div><div className="mt-2 text-xs font-medium text-emerald-700">Source de vérité Apex</div></div> : <p className="text-sm text-slate-500">Aucune source officielle confirmée.</p>}
            <div className="mt-4 text-xs text-slate-500">Dernière vérification : {formatDateTime(item.last_verified_at)}</div>
            <div className="mt-1 text-xs text-slate-500">Lecture approfondie : {formatDateTime(item.deep_read_at)}</div>
          </Section>

          <Section title="Toutes les sources détectées" icon={<Link2 className="h-4 w-4" />}>
            {(linksResult.data ?? []).length === 0 ? <p className="text-sm text-slate-500">Aucune source secondaire rattachée.</p> : <div className="space-y-3">{(linksResult.data ?? []).map((link) => { const source = sourceById.get(link.source_id); return <a key={link.id} href={link.source_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-800">{source?.name ?? "Source"}</span><ExternalLink className="h-3.5 w-3.5 text-slate-400" /></div><div className="mt-1 text-xs text-slate-500">{link.match_status} · vue {formatDateTime(link.last_detected_at)}</div></a>; })}</div>}
            <details className="mt-4 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">+ Rattacher une source</summary><form action={linkOpportunitySource} className="mt-3 space-y-3"><input type="hidden" name="opportunity_id" value={item.id} /><select name="source_id" required className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Choisir une source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><input name="source_url" type="url" required placeholder="URL exacte de la fiche programme" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">Rattacher</button></form></details>
          </Section>

          <Section title="Territoires" icon={<MapPin className="h-4 w-4" />}>
            {(territoriesResult.data ?? []).length === 0 ? <p className="text-sm text-slate-500">Aucun territoire structuré.</p> : <div className="space-y-2">{(territoriesResult.data ?? []).map((territory) => <div key={territory.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{territory.scope_level === "canada" ? "Canada" : [territory.province_territory, territory.region, territory.mrc_equivalent, territory.municipality].filter(Boolean).join(" → ")}</div>)}</div>}
            <details className="mt-4 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">+ Ajouter un territoire</summary><form action={addOpportunityTerritory} className="mt-3 grid gap-2"><input type="hidden" name="opportunity_id" value={item.id} /><select name="scope_level" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="canada">Canada</option><option value="province_territory">Province / territoire</option><option value="region">Région</option><option value="mrc_equivalent">MRC / équivalent</option><option value="municipality">Municipalité</option></select><input name="province_territory" placeholder="Province / territoire" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input name="region" placeholder="Région" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input name="mrc_equivalent" placeholder="MRC / équivalent" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input name="municipality" placeholder="Municipalité" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">Ajouter</button></form></details>
          </Section>

          <Section title="Qualification Apex"><div className="flex flex-wrap gap-2"><StatusButton id={item.id} status="to_review">À analyser</StatusButton><StatusButton id={item.id} status="qualified" primary>Pertinent</StatusButton><StatusButton id={item.id} status="ignored">Ignorer</StatusButton></div>{item.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{item.notes}</p>}</Section>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">{icon}{label}</div><div className="mt-2 text-lg font-semibold text-slate-950">{value}</div></div>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>; }
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><span className="text-slate-400">{icon}</span><h2 className="font-semibold text-slate-950">{title}</h2></div>{children}</section>; }
function TagBlock({ label, values }: { label: string; values: string[] }) { return <div className="mt-4"><div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div><div className="flex flex-wrap gap-1.5">{values.map((value) => <span key={value} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{value}</span>)}</div></div>; }
function StatusButton({ id, status, children, primary = false }: { id: string; status: string; children: React.ReactNode; primary?: boolean }) { return <form action={updateOpportunityStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className={primary ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700" : "rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"}>{children}</button></form>; }
