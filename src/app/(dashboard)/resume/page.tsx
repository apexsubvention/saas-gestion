import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { claimsListAll } from "@/server/repositories/claims.repository";
import { milestonesListAll } from "@/server/repositories/milestones.repository";
import {
  ACTIVE_GRANT_PROJECT_STATUSES,
  TASK_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  CLAIM_STATUS_LABELS,
  DOCUMENT_REQUEST_STATUS_LABELS,
} from "@/features/grants/constants";
import {
  buildSummary,
  formatDaysLeft,
  PRIORITY_1_DAYS,
  PRIORITY_2_DAYS,
  type SummaryInputItem,
  type SummaryItemKind,
  type SummaryProject,
} from "@/features/schedule/summary";

export const dynamic = "force-dynamic";

// « Résumé » : vue d'ensemble, par dossier, de tout ce qui arrive à échéance bientôt --
// Priorité 1 = 30 jours ou moins (retards inclus), Priorité 2 = 31 à 60 jours. Sources : tâches,
// échéances de convention (milestones), réclamations, documents demandés au client, et date de fin
// des dossiers actifs. Le calcul est dans src/features/schedule/summary.ts ; la gestion de chaque
// élément reste sur la fiche du dossier (ou dans « Échéanciers & Tâches »).

type JoinedProject = {
  name: string;
  client_id: string;
  clients?: { name: string } | null;
  grant_programs?: { name: string } | null;
} | null;

export default async function ResumePage() {
  await requireOrgContext();
  const supabase = await createClient();

  const [tasks, milestones, claims, docsResult, projectsResult] = await Promise.all([
    tasksListAll(supabase)(),
    milestonesListAll(supabase)(),
    claimsListAll(supabase)(),
    supabase
      .from("document_requests")
      .select("id,title,due_date,status,client_id,grant_project_id,clients(name),grant_projects(name, client_id, clients(name), grant_programs(name))")
      .not("status", "in", '("validated","not_required")')
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(300),
    supabase
      .from("grant_projects")
      .select("id,name,status,client_id,official_end_date,internal_target_end_date,approved_grant_amount,clients(name),grant_programs(name)")
      .in("status", ACTIVE_GRANT_PROJECT_STATUSES)
      .limit(500),
  ]);

  const projects = (projectsResult.data ?? []) as any[];
  const projectById = new Map<string, any>(projects.map((p) => [p.id, p]));

  const fromProject = (projectId: string | null, joined: JoinedProject | undefined, fallbackClient?: { id: string | null; name: string | null }) => {
    const p = projectId ? projectById.get(projectId) : null;
    return {
      projectId,
      projectName: joined?.name ?? p?.name ?? null,
      clientId: joined?.client_id ?? p?.client_id ?? fallbackClient?.id ?? null,
      clientName: joined?.clients?.name ?? p?.clients?.name ?? fallbackClient?.name ?? null,
      programName: joined?.grant_programs?.name ?? p?.grant_programs?.name ?? null,
    };
  };

  const input: SummaryInputItem[] = [];

  for (const t of (tasks ?? []) as any[]) {
    input.push({
      kind: "task",
      id: t.id,
      title: t.title,
      date: t.due_date,
      statusLabel: TASK_STATUS_LABELS[t.status] ?? t.status,
      amount: null,
      href: t.grant_project_id ? `/grants/${t.grant_project_id}?tab=echeancier` : t.client_id ? `/clients/${t.client_id}` : "/echeancier",
      ...fromProject(t.grant_project_id, t.grant_projects, { id: t.client_id, name: t.clients?.name ?? null }),
    });
  }

  // Un dossier qui a déjà une échéance « Fin de projet » active n'a pas besoin d'une 2e ligne
  // tirée de sa date de fin.
  const projectsWithEndMilestone = new Set<string>();
  for (const m of (milestones ?? []) as any[]) {
    if (m.type === "project_end") projectsWithEndMilestone.add(m.grant_project_id);
    input.push({
      kind: "milestone",
      id: m.id,
      title: m.title,
      date: m.internal_due_date ?? m.official_due_date,
      statusLabel: MILESTONE_STATUS_LABELS[m.status] ?? m.status,
      amount: null,
      href: `/grants/${m.grant_project_id}?tab=echeancier`,
      ...fromProject(m.grant_project_id, m.grant_projects),
    });
  }

  for (const c of (claims ?? []) as any[]) {
    input.push({
      kind: "claim",
      id: c.id,
      title: c.claim_number || "Réclamation",
      date: c.due_date,
      statusLabel: CLAIM_STATUS_LABELS[c.status] ?? c.status,
      amount: c.claimed_amount ?? c.approved_amount ?? null,
      href: `/grants/${c.grant_project_id}?tab=echeancier`,
      ...fromProject(c.grant_project_id, c.grant_projects),
    });
  }

  for (const d of (docsResult.data ?? []) as any[]) {
    input.push({
      kind: "document",
      id: d.id,
      title: d.title,
      date: d.due_date,
      statusLabel: DOCUMENT_REQUEST_STATUS_LABELS[d.status] ?? d.status,
      amount: null,
      href: d.grant_project_id ? `/grants/${d.grant_project_id}` : d.client_id ? `/clients/${d.client_id}` : "/echeancier",
      ...fromProject(d.grant_project_id, d.grant_projects, { id: d.client_id, name: d.clients?.name ?? null }),
    });
  }

  for (const p of projects) {
    if (projectsWithEndMilestone.has(p.id)) continue;
    const end = p.internal_target_end_date ?? p.official_end_date;
    if (!end) continue;
    input.push({
      kind: "project_end",
      id: p.id,
      title: "Fin du projet",
      date: end,
      statusLabel: null,
      amount: null,
      href: `/grants/${p.id}`,
      ...fromProject(p.id, null),
    });
  }

  const { priority1, priority2 } = buildSummary(input);
  const p1Items = priority1.reduce((n, p) => n + p.items.length, 0);
  const p2Items = priority2.reduce((n, p) => n + p.items.length, 0);
  const overdue = priority1.reduce((n, p) => n + p.overdueCount, 0);

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-indigo-600">
            <ClipboardList className="h-4 w-4" /> Résumé
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Ce qui arrive à échéance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dossiers classés selon leur prochaine échéance : tâches, échéances de convention, réclamations, documents
            attendus et fin de projet.
          </p>
        </div>
        <Link
          href="/echeancier"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Échéanciers &amp; Tâches <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          tone="red"
          icon={AlertTriangle}
          label={`Priorité 1 · ${PRIORITY_1_DAYS} jours`}
          value={`${priority1.length} dossier${priority1.length > 1 ? "s" : ""}`}
          detail={`${p1Items} échéance${p1Items > 1 ? "s" : ""}`}
        />
        <MetricCard
          tone="amber"
          icon={Clock}
          label={`Priorité 2 · ${PRIORITY_2_DAYS} jours`}
          value={`${priority2.length} dossier${priority2.length > 1 ? "s" : ""}`}
          detail={`${p2Items} échéance${p2Items > 1 ? "s" : ""}`}
        />
        <MetricCard
          tone="slate"
          icon={CalendarClock}
          label="En retard"
          value={String(overdue)}
          detail={overdue > 0 ? "Inclus dans la priorité 1" : "Aucun retard"}
        />
      </div>

      <PrioritySection
        level={1}
        title="Priorité 1"
        subtitle={`Échéance dans ${PRIORITY_1_DAYS} jours ou moins (retards inclus)`}
        projects={priority1}
        empty={`Rien n'arrive à échéance dans les ${PRIORITY_1_DAYS} prochains jours.`}
      />
      <PrioritySection
        level={2}
        title="Priorité 2"
        subtitle={`Échéance dans ${PRIORITY_1_DAYS + 1} à ${PRIORITY_2_DAYS} jours`}
        projects={priority2}
        empty={`Rien entre ${PRIORITY_1_DAYS + 1} et ${PRIORITY_2_DAYS} jours.`}
      />
    </div>
  );
}

const TONES = {
  red: { icon: "bg-red-50 text-red-600", border: "border-red-200", head: "bg-red-50/60 border-red-100", badge: "bg-red-600 text-white" },
  amber: { icon: "bg-amber-50 text-amber-600", border: "border-amber-200", head: "bg-amber-50/60 border-amber-100", badge: "bg-amber-500 text-white" },
  slate: { icon: "bg-slate-100 text-slate-700", border: "border-slate-200", head: "bg-slate-50 border-slate-100", badge: "bg-slate-700 text-white" },
} as const;

function MetricCard({
  tone,
  icon: Icon,
  label,
  value,
  detail,
}: {
  tone: keyof typeof TONES;
  icon: typeof Clock;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${TONES[tone].border}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
        </div>
        <div className={`rounded-xl p-2.5 ${TONES[tone].icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function PrioritySection({
  level,
  title,
  subtitle,
  projects,
  empty,
}: {
  level: 1 | 2;
  title: string;
  subtitle: string;
  projects: SummaryProject[];
  empty: string;
}) {
  const tone = TONES[level === 1 ? "red" : "amber"];
  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${tone.border}`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${tone.head}`}>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>P{level}</span>
          <div>
            <h2 className="font-semibold text-slate-950">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className="text-sm text-slate-500">
          {projects.length} dossier{projects.length > 1 ? "s" : ""}
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">{empty}</div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.key} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

const KIND_LABELS: Record<SummaryItemKind, string> = {
  task: "Tâche",
  milestone: "Échéance",
  claim: "Réclamation",
  document: "Document",
  project_end: "Fin de projet",
};
const KIND_BADGE: Record<SummaryItemKind, string> = {
  task: "bg-slate-100 text-slate-700",
  milestone: "bg-indigo-50 text-indigo-700",
  claim: "bg-emerald-50 text-emerald-700",
  document: "bg-sky-50 text-sky-700",
  project_end: "bg-violet-50 text-violet-700",
};

function dueClass(daysLeft: number) {
  if (daysLeft < 0) return "text-red-600 font-semibold";
  if (daysLeft <= 7) return "text-red-600";
  if (daysLeft <= 30) return "text-amber-700";
  return "text-slate-500";
}

function ProjectCard({ project }: { project: SummaryProject }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          {project.projectId ? (
            <Link href={`/grants/${project.projectId}`} className="font-medium text-slate-900 hover:text-indigo-600">
              {project.projectName}
            </Link>
          ) : (
            <span className="font-medium text-slate-900">{project.projectName}</span>
          )}
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {[project.clientName, project.programName].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-xs ${dueClass(project.nextDaysLeft)}`}>{formatDaysLeft(project.nextDaysLeft)}</div>
          {project.overdueCount > 0 && (
            <div className="mt-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              {project.overdueCount} en retard
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {project.items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link href={item.href} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[item.kind]}`}>
                {KIND_LABELS[item.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-800">{item.title}</div>
                <div className="text-[11px] text-slate-400">
                  {formatDate(item.date)}
                  {item.statusLabel ? ` · ${item.statusLabel}` : ""}
                  {item.amount != null ? ` · ${money(item.amount)}` : ""}
                </div>
              </div>
              <span className={`shrink-0 text-xs ${dueClass(item.daysLeft)}`}>{formatDaysLeft(item.daysLeft)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`)
  );
}

function money(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}
