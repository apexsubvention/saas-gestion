import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileWarning,
  FolderKanban,
  Radar,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";

const ACTIVE_PROJECT_STATUSES = [
  "qualifying",
  "preparing",
  "submitted",
  "under_review",
  "approved",
  "active",
  "final_claim",
];

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Aucune échéance";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`)
  );
}

function scoreClass(score: number | null) {
  if (score == null) return "bg-slate-100 text-slate-600";
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 60) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function DashboardPage() {
  await requireOrgContext();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [opportunitiesResult, upcomingResult, projectsResult, claimsResult, docsResult, tasksResult] = await Promise.all([
    supabase
      .from("funding_opportunities")
      .select("id,title,organization,summary,max_amount,deadline,territory,status,relevance_score,discovered_at")
      .neq("status", "ignored")
      .order("discovered_at", { ascending: false })
      .limit(5),
    supabase
      .from("funding_opportunities")
      .select("id,title,organization,expected_open_date,preparation_documents")
      .eq("availability_status", "opening_soon")
      .order("expected_open_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("grant_projects")
      .select("id,name,status,approved_grant_amount,official_end_date,clients(name),grant_programs(name)")
      .in("status", ACTIVE_PROJECT_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("claims")
      .select("id,status,due_date,claimed_amount,grant_projects(name)")
      .gte("due_date", today)
      .not("status", "in", '("paid","rejected")')
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("document_requests")
      .select("id,title,due_date,status,clients(name)")
      .not("status", "in", '("validated","not_required")')
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("id,title,due_date,priority,status")
      .not("status", "in", '("done","cancelled")')
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const opportunities = opportunitiesResult.data ?? [];
  const upcoming = upcomingResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const claims = claimsResult.data ?? [];
  const docs = docsResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const totalApproved = projects.reduce((sum, project) => sum + Number(project.approved_grant_amount ?? 0), 0);
  const priorityCount = docs.length + claims.length + tasks.filter((task) => task.priority === "high").length;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
            <Sparkles className="h-4 w-4" /> Cockpit Apex
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-500">Veille, dossiers actifs et prochaines actions au même endroit.</p>
        </div>
        <Link
          href="/watch/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          <Radar className="h-4 w-4" /> Ajouter une opportunité
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Radar} label="Opportunités détectées" value={String(opportunities.length)} detail="À consulter dans la veille" />
        <MetricCard icon={FolderKanban} label="Dossiers actifs" value={String(projects.length)} detail="En préparation ou en suivi" />
        <MetricCard icon={CircleDollarSign} label="Subventions approuvées" value={formatMoney(totalApproved)} detail="Sur les dossiers actifs visibles" />
        <MetricCard icon={AlertCircle} label="À traiter" value={String(priorityCount)} detail="Échéances, documents et tâches" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">Veille des subventions</h2>
              <p className="text-xs text-slate-500">Nouvelles opportunités à qualifier</p>
            </div>
            <Link href="/watch" className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Voir toute la veille <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {opportunities.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="Aucune opportunité dans la veille"
              description="Ajoute une première subvention ou opportunité pour commencer à construire ta veille Apex."
              href="/watch/new"
              cta="Ajouter une opportunité"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {opportunities.map((item) => (
                <Link key={item.id} href="/watch" className="block px-5 py-4 transition hover:bg-slate-50">
                  <div className="flex gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{item.title ?? "Sans titre"}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${scoreClass(item.relevance_score)}`}>
                          {item.relevance_score != null ? `${item.relevance_score}% fit` : "À scorer"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.organization ?? "Organisme à préciser"} · {item.territory ?? "Territoire à préciser"}
                      </p>
                      {item.summary && <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{item.summary}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-slate-900">{formatMoney(item.max_amount)}</div>
                      <div className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5" /> {formatDate(item.deadline)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">À traiter</h2>
            <p className="text-xs text-slate-500">Ce qui mérite ton attention maintenant</p>
          </div>
          <div className="space-y-5 p-5">
            <ActionGroup
              title="Réclamations à venir"
              icon={CalendarClock}
              items={claims.map((claim) => ({
                id: claim.id,
                title: claim.grant_projects?.name ?? "Réclamation",
                detail: `${formatDate(claim.due_date)} · ${formatMoney(claim.claimed_amount)}`,
              }))}
              empty="Aucune réclamation urgente"
            />
            <ActionGroup
              title="Documents attendus"
              icon={FileWarning}
              items={docs.map((doc) => ({
                id: doc.id,
                title: doc.title,
                detail: `${doc.clients?.name ?? "Client"} · ${formatDate(doc.due_date)}`,
              }))}
              empty="Aucun document en attente"
            />
          </div>
        </section>
      </div>


      {upcoming.length > 0 && <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
        <div className="flex items-center justify-between border-b border-amber-100 px-5 py-4">
          <div><h2 className="font-semibold text-slate-950">Ouverture bientôt</h2><p className="text-xs text-slate-500">Programmes à préparer avant l’ouverture</p></div>
          <Link href="/watch?view=opening_soon&audience=business" className="flex items-center gap-1 text-sm font-medium text-amber-700">Voir tout <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{upcoming.map((item) => <Link key={item.id} href={`/watch/${item.id}`} className="rounded-xl border border-amber-100 bg-white p-4 hover:border-amber-200"><div className="text-sm font-semibold text-slate-900">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.organization ?? "Organisme"}</div><div className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-700"><CalendarClock className="h-3.5 w-3.5" /> {item.expected_open_date ? `Ouverture prévue ${formatDate(item.expected_open_date)}` : "Date à confirmer"}</div><div className="mt-2 text-xs text-slate-500">{(item.preparation_documents ?? []).length} document{(item.preparation_documents ?? []).length > 1 ? "s" : ""} à préparer</div></Link>)}</div>
      </section>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">Dossiers actifs</h2>
            <p className="text-xs text-slate-500">Vue rapide de ton portefeuille de subventions</p>
          </div>
          <Link href="/grants" className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Tous les dossiers <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Aucun dossier actif" description="Crée ton premier dossier de subvention pour commencer le suivi." href="/grants/new" cta="Créer un dossier" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Client / dossier</th>
                  <th className="px-5 py-3 font-medium">Programme</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Approuvé</th>
                  <th className="px-5 py-3 font-medium">Fin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link href={`/grants/${project.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{project.name}</Link>
                      <div className="mt-0.5 text-xs text-slate-500">{project.clients?.name ?? "Client"}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{project.grant_programs?.name ?? "—"}</td>
                    <td className="px-5 py-4"><StatusBadge value={project.status} /></td>
                    <td className="px-5 py-4 font-medium text-slate-900">{formatMoney(project.approved_grant_amount)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(project.official_end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Radar; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Icon className="h-5 w-5" /></div>
      </div>
      <div className="mt-3 text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, href, cta }: { icon: typeof Radar; title: string; description: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="rounded-2xl bg-slate-100 p-3 text-slate-500"><Icon className="h-6 w-6" /></div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      <Link href={href} className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-800">{cta}</Link>
    </div>
  );
}

function ActionGroup({ title, icon: Icon, items, empty }: { title: string; icon: typeof Radar; items: { id: string; title: string; detail: string }[]; empty: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" /> {title}</div>
      {items.length === 0 ? <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-400">{empty}</div> : (
        <div className="space-y-2">{items.slice(0, 3).map((item) => <div key={item.id} className="rounded-lg border border-slate-100 px-3 py-2.5"><div className="text-sm font-medium text-slate-800">{item.title}</div><div className="mt-0.5 text-xs text-slate-500">{item.detail}</div></div>)}</div>
      )}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    qualifying: "Qualification", preparing: "Préparation", submitted: "Déposé", under_review: "En analyse",
    approved: "Approuvé", active: "Actif", final_claim: "Réclamation finale",
  };
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{labels[value] ?? value}</span>;
}
