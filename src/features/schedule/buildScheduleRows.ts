// Construction unifiée des lignes d'échéancier (tâches + jalons + réclamations),
// utilisée à la fois par la vue globale (src/app/(dashboard)/echeancier/page.tsx,
// alimentée par tasksListAll/milestonesListAll/claimsListAll) et par la section
// Échéancier d'un dossier précis (src/app/(dashboard)/grants/[id]/page.tsx, alimentée
// par les listByProject non jointes) -- remplace la logique ScheduleRow/Row qui était
// dupliquée presque à l'identique dans les deux pages.
import {
  TASK_STATUS_LABELS,
  taskStatusBadgeClass,
  TASK_PRIORITY_LABELS,
  MILESTONE_STATUS_LABELS,
  milestoneStatusBadgeClass,
  CLAIM_STATUS_LABELS,
  claimStatusBadgeClass,
} from "@/features/grants/constants";
import { computePriorityBucket, formatRelativeDueText, type PriorityBucket } from "./priority";

export type ScheduleEntry = {
  kind: "task" | "milestone" | "claim";
  id: string;
  title: string;
  subtitle: string | null;
  date: string | null;
  bucket: PriorityBucket;
  dueText: string;
  statusLabel: string;
  statusClass: string;
  status: string; // valeur brute, nécessaire pour les sélecteurs de statut existants
  clientName: string | null;
  projectName: string | null;
  programName: string | null;
  amount: number | null;
  missingCount: number | null;
  estimated: boolean;
  href: string;
};

type JoinedProject = {
  name: string;
  client_id: string;
  clients?: { name: string } | null;
  grant_programs?: { name: string } | null;
} | null;

type TaskLike = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: string;
  client_id: string | null;
  grant_project_id: string | null;
  grant_projects?: JoinedProject;
  clients?: { name: string } | null;
};

type MilestoneLike = {
  id: string;
  title: string;
  internal_due_date: string | null;
  status: string;
  source: string;
  grant_project_id: string;
  grant_projects?: JoinedProject;
};

type ClaimLike = {
  id: string;
  claim_number: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string;
  claimed_amount: number | null;
  approved_amount: number | null;
  grant_project_id: string;
  grant_projects?: JoinedProject;
};

// Fournir `context` quand les lignes viennent d'un listByProject non joint (page d'un
// dossier précis, client/dossier/programme déjà connus par ailleurs sur la page) --
// sinon les noms sont tirés des relations jointes (vue globale, plusieurs dossiers).
type NameContext = { clientName: string | null; projectName: string | null; programName: string | null };

const TASK_TERMINAL = (status: string) => status === "done" || status === "cancelled";
const MILESTONE_TERMINAL = (status: string) => status === "done" || status === "cancelled";
const CLAIM_TERMINAL = (status: string) => status === "paid" || status === "rejected";

export function buildScheduleRows(input: {
  tasks: TaskLike[];
  milestones: MilestoneLike[];
  claims: ClaimLike[];
  missingCountByClaimId?: Record<string, number>;
  context?: NameContext;
}): ScheduleEntry[] {
  const rows: ScheduleEntry[] = [];

  for (const t of input.tasks) {
    const terminal = TASK_TERMINAL(t.status);
    rows.push({
      kind: "task",
      id: t.id,
      title: t.title,
      subtitle: TASK_PRIORITY_LABELS[t.priority] ?? t.priority,
      date: t.due_date,
      bucket: computePriorityBucket(t.due_date, terminal),
      dueText: formatRelativeDueText(t.due_date, terminal),
      statusLabel: TASK_STATUS_LABELS[t.status] ?? t.status,
      statusClass: taskStatusBadgeClass(t.status),
      status: t.status,
      clientName: input.context?.clientName ?? t.grant_projects?.clients?.name ?? t.clients?.name ?? null,
      projectName: input.context?.projectName ?? t.grant_projects?.name ?? null,
      programName: input.context?.programName ?? t.grant_projects?.grant_programs?.name ?? null,
      amount: null,
      missingCount: null,
      estimated: false,
      href: t.grant_project_id ? `/grants/${t.grant_project_id}` : t.client_id ? `/clients/${t.client_id}` : "#",
    });
  }

  for (const m of input.milestones) {
    const terminal = MILESTONE_TERMINAL(m.status);
    rows.push({
      kind: "milestone",
      id: m.id,
      title: m.title,
      subtitle: null,
      date: m.internal_due_date,
      bucket: computePriorityBucket(m.internal_due_date, terminal),
      dueText: formatRelativeDueText(m.internal_due_date, terminal),
      statusLabel: MILESTONE_STATUS_LABELS[m.status] ?? m.status,
      statusClass: milestoneStatusBadgeClass(m.status),
      status: m.status,
      clientName: input.context?.clientName ?? m.grant_projects?.clients?.name ?? null,
      projectName: input.context?.projectName ?? m.grant_projects?.name ?? null,
      programName: input.context?.programName ?? m.grant_projects?.grant_programs?.name ?? null,
      amount: null,
      missingCount: null,
      estimated: m.source === "ai_proposed",
      href: `/grants/${m.grant_project_id}`,
    });
  }

  for (const c of input.claims) {
    const terminal = CLAIM_TERMINAL(c.status);
    rows.push({
      kind: "claim",
      id: c.id,
      title: c.claim_number || "Réclamation",
      subtitle: c.period_start || c.period_end ? `${c.period_start ?? "—"} → ${c.period_end ?? "—"}` : null,
      date: c.due_date,
      bucket: computePriorityBucket(c.due_date, terminal),
      dueText: formatRelativeDueText(c.due_date, terminal),
      statusLabel: CLAIM_STATUS_LABELS[c.status] ?? c.status,
      statusClass: claimStatusBadgeClass(c.status),
      status: c.status,
      clientName: input.context?.clientName ?? c.grant_projects?.clients?.name ?? null,
      projectName: input.context?.projectName ?? c.grant_projects?.name ?? null,
      programName: input.context?.programName ?? c.grant_projects?.grant_programs?.name ?? null,
      amount: c.claimed_amount ?? c.approved_amount ?? null,
      missingCount: input.missingCountByClaimId?.[c.id] ?? null,
      estimated: false,
      href: `/grants/${c.grant_project_id}`,
    });
  }

  return rows;
}
