import Link from "next/link";
import { CalendarClock, ExternalLink, Plus, Radar, Search, DatabaseZap, RefreshCw, MapPin, Layers3, MessageSquareText, RotateCcw, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { refreshFundingWatch, updateOpportunityStatus } from "./actions";
import { FUNDING_TYPE_LABELS, FUNDING_TYPE_OPTIONS, WATCH_STATUS_LABELS } from "@/features/watch/constants";
import { fundingSearchScore } from "@/features/watch/search";
import { extractProjectSignals, scoreOpportunityForProject, type FundingAwardForMatch, type OpportunityForMatch, type ProjectMatchResult } from "@/features/watch/projectMatch";

function formatMoney(value: number | null) {
  if (value == null) return "Non précisé";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}
function formatDate(value: string | null) {
  if (!value) return "En continu / à confirmer";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

type SearchParams = { q?: string; project?: string; view?: string; audience?: string; province?: string; funding_type?: string; source?: string; deadline?: string };

export default async function WatchPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireOrgContext(); const supabase = await createClient();

  const q = (searchParams?.q ?? "").trim().toLowerCase(); const project = (searchParams?.project ?? "").trim(); const view = searchParams?.view ?? "active";
  const audience = searchParams?.audience ?? "business"; const province = searchParams?.province ?? "all"; const fundingType = searchParams?.funding_type ?? "all"; const sourceId = searchParams?.source ?? "all"; const deadline = searchParams?.deadline ?? "all";
  const now = Date.now();

  const [opportunitiesResult, sourcesResult, linksResult, territoriesResult, changesResult, awardsResult] = await Promise.all([
    supabase.from("funding_opportunities").select("*").order("discovered_at", { ascending: false }),
    supabase.from("funding_sources").select("*").order("priority", { ascending: true }).order("name"),
    supabase.from("funding_opportunity_sources").select("opportunity_id,source_id"),
    supabase.from("funding_opportunity_territories").select("*"),
    supabase.from("funding_opportunity_changes").select("opportunity_id,detected_at").gte("detected_at", new Date(Date.now()-14*86400000).toISOString()),
    // Chargé seulement quand "Parle-moi de ton projet" est utilisé : sert à repérer des
    // projets déjà financés dont la nature ressemble au texte décrit (voir projectMatch.ts).
    project
      ? supabase.from("funding_awards").select("id,opportunity_id,recipient_name,project_title,description,amount,location")
      : Promise.resolve({ data: [] as Array<FundingAwardForMatch & { opportunity_id: string | null }>, error: null }),
  ]);
  if (opportunitiesResult.error) throw opportunitiesResult.error; if (sourcesResult.error) throw sourcesResult.error; if (linksResult.error) throw linksResult.error; if (territoriesResult.error) throw territoriesResult.error; if (changesResult.error) throw changesResult.error; if (awardsResult.error) throw awardsResult.error;
  const all = opportunitiesResult.data ?? []; const sources = sourcesResult.data ?? []; const links = linksResult.data ?? []; const territories = territoriesResult.data ?? [];
  const changed = new Set((changesResult.data ?? []).map((x) => x.opportunity_id)); const sourceById = new Map(sources.map((s) => [s.id, s]));

  const awardsByOpportunity = new Map<string, FundingAwardForMatch[]>();
  for (const award of awardsResult.data ?? []) {
    if (!award.opportunity_id) continue;
    const list = awardsByOpportunity.get(award.opportunity_id) ?? [];
    list.push(award);
    awardsByOpportunity.set(award.opportunity_id, list);
  }

  // "Parle-moi de ton projet" : les signaux (lieu, budget, effectifs, univers touchés) sont
  // extraits une seule fois du texte libre, puis chaque programme est scoré contre eux via
  // projectMatch.ts — voir ce fichier pour le détail des 6 facteurs pris en compte.
  const projectSignals = project ? extractProjectSignals(project) : null;
  function matchProject(item: (typeof all)[number]): ProjectMatchResult | null {
    if (!projectSignals) return null;
    return scoreOpportunityForProject(projectSignals, item as unknown as OpportunityForMatch, awardsByOpportunity.get(item.id) ?? []);
  }

  const withMatch = all.map((item) => ({
    item,
    matchResult: matchProject(item),
    searchMatch: fundingSearchScore(q, item),
  }));

  const scored = withMatch.filter(({ item, matchResult, searchMatch }) => {
    const qMatch = !q || searchMatch > 0;
    const viewMatch = view === "all" ? true : view === "active" ? !["ignored","archived"].includes(item.status) : view === "modified" ? changed.has(item.id) : view === "opening_soon" ? item.availability_status === "opening_soon" : item.status === view;
    const audienceMatch = audience === "all" ? true : audience === "business" ? (["private_business","mixed"].includes(item.target_audience) || (item.target_audience === "unknown" && item.business_relevance_score >= 50)) : item.target_audience === audience;
    const itemTerritories = territories.filter((t) => t.opportunity_id === item.id);
    const provinceMatch = province === "all" || itemTerritories.some((t) => t.province_territory === province);
    const typeMatch = fundingType === "all" || item.funding_type === fundingType;
    const linked = links.filter((l) => l.opportunity_id === item.id).map((l) => l.source_id);
    const sourceMatch = sourceId === "all" || item.official_source_id === sourceId || linked.includes(sourceId);
    let deadlineMatch = true; if (deadline !== "all") { if (!item.deadline) deadlineMatch = false; else { const d = new Date(`${item.deadline}T23:59:59`).getTime(); deadlineMatch = d >= now && d <= now + Number(deadline)*86400000; } }
    const projectMatch = !project || (matchResult?.score ?? 0) > 0;
    return qMatch && viewMatch && audienceMatch && provinceMatch && typeMatch && sourceMatch && deadlineMatch && projectMatch;
  }).sort((a,b) => {
    if (project) return (b.matchResult?.score ?? 0) - (a.matchResult?.score ?? 0);
    if (q) return b.searchMatch - a.searchMatch;
    return (b.item.business_relevance_score ?? 0) - (a.item.business_relevance_score ?? 0);
  });

  // Diagnostic UX : indique lorsque la recherche trouve des programmes, mais qu'un filtre
  // additionnel (type, source, province, audience...) les masque.
  const lexicalMatches = q
    ? withMatch.filter((x) => x.searchMatch > 0).map((x) => x.item)
    : project
      ? withMatch.filter((x) => (x.matchResult?.score ?? 0) > 0).map((x) => x.item)
      : [];

  const opportunities = scored.map((x) => x.item); const matchById = new Map(scored.map((x) => [x.item.id, x.matchResult]));
  const provinces = unique(territories.map((x) => x.province_territory));

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600"><Radar className="h-4 w-4"/> Veille</div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Veille des subventions</h1><p className="mt-1 text-sm text-slate-500">Vue par défaut centrée sur les aides pertinentes pour les entreprises.</p></div>
      <div className="flex flex-wrap gap-2"><form action={refreshFundingWatch}><button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"><RefreshCw className="h-4 w-4"/>Actualiser la veille</button></form><Link href="/watch/sources" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"><DatabaseZap className="h-4 w-4"/>Sources surveillées</Link><Link href="/watch/new" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4"/>Ajouter</Link></div>
    </div>

    <form className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <input type="hidden" name="view" value={view}/><input type="hidden" name="audience" value="business"/>
      <div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-600 p-2.5 text-white"><MessageSquareText className="h-5 w-5"/></div><div className="flex-1"><div className="font-semibold text-slate-950">Parle-moi de ton projet</div><p className="mt-1 text-sm text-slate-600">Ex. « PME de Granby, 15 employés, implantation d’un CRM à 40 000 $ et formation de 6 employés. » Apex repère le lieu, le budget, les effectifs et les univers touchés (stage, formation, export, IA, manufacturier…), puis compare chaque programme sur son admissibilité territoriale, son adéquation financière, sa disponibilité, ses priorités et des projets déjà financés similaires quand ils existent.</p><textarea name="project" defaultValue={project} rows={3} className="mt-3 w-full rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder="Décris l’entreprise, le lieu, le projet, le budget, les dépenses et les emplois concernés…"/><div className="mt-3 flex flex-wrap items-center gap-3"><button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Trouver les aides compatibles</button>{project && <Link href="/watch" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600"><RotateCcw className="h-4 w-4"/>Effacer</Link>}{project && <span className="text-xs text-slate-500">Score de pertinence explicable — pas une probabilité d’acceptation.</span>}</div></div></div>
    </form>

    <div className="flex flex-wrap gap-2"><ViewTab href="/watch?view=active&audience=business" active={view==="active"}>Actives</ViewTab><ViewTab href="/watch?view=new&audience=business" active={view==="new"}>Nouvelles</ViewTab><ViewTab href="/watch?view=to_review&audience=business" active={view==="to_review"}>À analyser</ViewTab><ViewTab href="/watch?view=qualified&audience=business" active={view==="qualified"}>Pertinentes</ViewTab><ViewTab href="/watch?view=modified&audience=business" active={view==="modified"}>Modifiées</ViewTab><ViewTab href="/watch?view=opening_soon&audience=business" active={view==="opening_soon"}>Ouverture bientôt</ViewTab><ViewTab href="/watch?view=all&audience=business" active={view==="all"}>Toutes</ViewTab></div>

    <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="view" value={view}/><div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400"/><input name="q" defaultValue={searchParams?.q} placeholder="Rechercher stage, stagiaire, CRM, exportation, formation…" className="w-full bg-transparent py-2.5 text-sm outline-none"/></label>
        <Select name="audience" defaultValue={audience} first="Entreprises"><option value="business">Entreprises</option><option value="mixed">Mixte</option><option value="nonprofit">OBNL / communautaire</option><option value="municipality">Municipal</option><option value="individual">Particuliers</option><option value="public_body">Organismes publics</option><option value="all">Tout afficher</option></Select>
        <Select name="funding_type" defaultValue={fundingType} first="Tous les types">{FUNDING_TYPE_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select name="source" defaultValue={sourceId} first="Toutes les sources">{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"><Search className="h-4 w-4"/>Rechercher</button>
      </div>
      <details className="rounded-xl bg-slate-50 px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Filtres avancés</summary><div className="mt-3 grid gap-3 md:grid-cols-3"><Select name="province" defaultValue={province} first="Toutes les provinces">{provinces.map((v)=><option key={v} value={v}>{v}</option>)}</Select><Select name="deadline" defaultValue={deadline} first="Toutes les échéances"><option value="30">Dans 30 jours</option><option value="60">Dans 60 jours</option><option value="90">Dans 90 jours</option></Select>{project && <input type="hidden" name="project" value={project}/>}</div></details>
    </form>

    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>{opportunities.length} opportunité{opportunities.length>1?"s":""} affichée{opportunities.length>1?"s":""}</span><span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4"/>Les programmes OBNL, municipaux et individuels sont masqués par défaut.</span></div>

    {opportunities.length === 0 && lexicalMatches.length > 0 && (q || project) && (fundingType !== "all" || sourceId !== "all" || province !== "all" || deadline !== "all" || audience !== "business") && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>{lexicalMatches.length} programme{lexicalMatches.length>1?"s":""} correspond{lexicalMatches.length>1?"ent":""} à ta recherche</strong>, mais les filtres actuels les masquent. <Link href={`/watch?view=${view}&audience=business${q?`&q=${encodeURIComponent(q)}`:""}${project?`&project=${encodeURIComponent(project)}`:""}`} className="ml-1 font-semibold underline">Réinitialiser les filtres et voir les résultats</Link>.</div>}

    {opportunities.length===0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Radar className="mx-auto h-8 w-8 text-slate-300"/><h2 className="mt-3 font-semibold text-slate-900">Aucune opportunité trouvée</h2><p className="mt-1 text-sm text-slate-500">Essaie une recherche plus large ou clique sur Actualiser la veille.</p></div> : <div className="grid gap-4 xl:grid-cols-2">{opportunities.map((item)=>{
      const officialSource=item.official_source_id?sourceById.get(item.official_source_id):null; const linked=links.filter((l)=>l.opportunity_id===item.id).map((l)=>l.source_id); const count=new Set([item.official_source_id,...linked].filter(Boolean)).size; const tr=territories.find((t)=>t.opportunity_id===item.id); const projectMatch=matchById.get(item.id)??null;
      return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">{WATCH_STATUS_LABELS[item.status]??item.status}</span>{item.funding_type&&<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px]">{FUNDING_TYPE_LABELS[item.funding_type]??item.funding_type}</span>}{item.availability_status==="opening_soon"&&<span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Ouverture bientôt</span>}{item.availability_status==="open"&&<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Ouvert</span>}<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Entreprise {item.business_relevance_score}%</span>{projectMatch&&<span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${projectMatch.priorityLabel==="Prioritaire"?"bg-violet-100 text-violet-800":projectMatch.priorityLabel==="À évaluer"?"bg-violet-50 text-violet-700":"bg-slate-100 text-slate-600"}`}>{projectMatch.priorityLabel} · {projectMatch.score}/100</span>}</div><Link href={`/watch/${item.id}`} className="font-semibold text-slate-950 hover:text-indigo-700">{item.title??"Sans titre"}</Link><p className="mt-1 text-sm text-slate-500">{item.organization??"Organisme à préciser"}</p></div>{(item.official_url||item.external_url)&&<a href={item.official_url??item.external_url??"#"} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-slate-500"><ExternalLink className="h-4 w-4"/></a>}</div>
      {item.summary&&<p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary}</p>}<div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1"><MapPin className="h-3.5 w-3.5"/>{tr?.province_territory??item.territory??"À préciser"}</span><span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1"><DatabaseZap className="h-3.5 w-3.5"/>{officialSource?`${officialSource.name} · ${officialSource.is_official?"officielle":"source principale"}`:"Source officielle à confirmer"}</span><span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1"><Layers3 className="h-3.5 w-3.5"/>{count} source{count>1?"s":""}</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3"><div><div className="text-xs text-slate-400">Financement max.</div><div className="mt-0.5 font-semibold">{formatMoney(item.max_amount)}</div></div><div><div className="text-xs text-slate-400">Taux max.</div><div className="mt-0.5 font-semibold">{item.funding_rate_max!=null?`${Number(item.funding_rate_max).toLocaleString("fr-CA")} %`:"Non précisé"}</div></div><div><div className="text-xs text-slate-400">{item.availability_status==="opening_soon"?"Ouverture prévue":"Échéance"}</div><div className="mt-0.5 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5"/>{formatDate(item.availability_status==="opening_soon"?item.expected_open_date:item.deadline)}</div></div></div>
      {projectMatch&&(projectMatch.reasons.length>0||projectMatch.criteriaToVerify.length>0)&&<div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
        {projectMatch.reasons.slice(0,3).map((reason,i)=><p key={`r${i}`} className="flex items-start gap-1.5 text-emerald-800"><span className="mt-0.5">✓</span><span>{reason}</span></p>)}
        {projectMatch.criteriaToVerify.slice(0,3).map((concern,i)=><p key={`c${i}`} className="flex items-start gap-1.5 text-amber-800"><span className="mt-0.5">?</span><span>{concern}</span></p>)}
      </div>}
      <div className="mt-4 flex flex-wrap gap-2">{item.status!=="to_review"&&<StatusButton id={item.id} status="to_review">À analyser</StatusButton>}{item.status!=="qualified"&&<StatusButton id={item.id} status="qualified" primary>Pertinent</StatusButton>}{item.status!=="ignored"&&<StatusButton id={item.id} status="ignored">Ignorer</StatusButton>}<Link href={`/watch/${item.id}`} className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Voir la fiche</Link></div></article>})}</div>}
  </div>;
}
function unique(values:Array<string|null>){return Array.from(new Set(values.filter((v):v is string=>Boolean(v)))).sort((a,b)=>a.localeCompare(b,"fr"));}
function ViewTab({href,active,children}:{href:string;active:boolean;children:React.ReactNode}){return <Link href={href} className={active?"rounded-full bg-slate-950 px-3.5 py-2 text-sm font-medium text-white":"rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600"}>{children}</Link>}
function Select({name,defaultValue,first,children}:{name:string;defaultValue:string;first:string;children:React.ReactNode}){return <select name={name} defaultValue={defaultValue} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"><option value="all">{first}</option>{children}</select>}
function StatusButton({id,status,children,primary=false}:{id:string;status:string;children:React.ReactNode;primary?:boolean}){return <form action={updateOpportunityStatus}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value={status}/><button className={primary?"rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white":"rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"}>{children}</button></form>}
