import type { ScheduleEntry } from "@/features/schedule/buildScheduleRows";
import { deleteConfirmText } from "@/features/schedule/confirmText";
import { isAutoClaimNumber, isAutoMilestone } from "@/features/schedule/dismissals";
import { CLAIM_STATUS_LABELS, MILESTONE_STATUS_LABELS, PRIORITY_BUCKET_LABELS, claimStatusBadgeClass, milestoneStatusBadgeClass, priorityBucketBadgeClass } from "@/features/grants/constants";
import type { ClaimRow } from "@/server/repositories/claims.repository";
import type { MilestoneRow } from "@/server/repositories/milestones.repository";
import type { TaskRow } from "@/server/repositories/tasks.repository";
import { NewTaskForm } from "./NewTaskForm";
import { NewClaimForm } from "./NewClaimForm";
import { NewMilestoneForm } from "./NewMilestoneForm";
import { SuggestMilestonesButton } from "./SuggestMilestonesButton";
import { TasksManager } from "./TasksManager";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { MilestoneStatusSelect } from "./MilestoneStatusSelect";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { DeleteScheduleItemButton } from "./DeleteScheduleItemButton";

const KIND_LABELS = { task: "Tâche", milestone: "Échéance", claim: "Réclamation" } as const;
const KIND_BADGE = {
  task: "bg-slate-100 text-slate-700",
  milestone: "bg-indigo-50 text-indigo-700",
  claim: "bg-emerald-50 text-emerald-700",
} as const;

function KindBadge({ kind }: { kind: keyof typeof KIND_LABELS }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[kind]}`}>{KIND_LABELS[kind]}</span>;
}

const claimLabel = (c: ClaimRow) => c.claim_number || `Réclamation (${c.period_start ?? "—"})`;

function AddCard({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="rounded-lg border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// Contenu de l'onglet « Échéanciers & tâches » d'un dossier : tout ce qui s'ajoute, se modifie et se supprime
// (tâches, échéances, réclamations) — manuel ou généré automatiquement.
export function SchedulePanel({
  grantProjectId,
  clientId,
  entries,
  tasks,
  milestones,
  claims,
  assignees,
}: {
  grantProjectId: string;
  clientId: string;
  entries: ScheduleEntry[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  claims: ClaimRow[];
  assignees: Array<{ id: string; name: string }>;
}) {
  const closedMilestones = milestones.filter((m) => m.status === "done" || m.status === "cancelled");
  const closedClaims = claims.filter((c) => c.status === "paid" || c.status === "rejected");
  const closedCount = closedMilestones.length + closedClaims.length;

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">
        Ajoute, modifie ou supprime des tâches, des échéances et des réclamations, qu&apos;elles soient manuelles ou générées automatiquement (entente, DDR mensuels).
        Les échéances marquées « estimée » sont calculées à partir des dates de l&apos;entente : valide-les ou supprime-les. Un élément automatique supprimé n&apos;est pas recréé quand tu modifies l&apos;entente.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Ajouter</h2>
        <div className="space-y-2">
          <AddCard title="+ Ajouter une tâche" open>
            <NewTaskForm grantProjectId={grantProjectId} clientId={clientId} assignees={assignees} claims={claims.map((c) => ({ id: c.id, label: claimLabel(c) }))} />
          </AddCard>
          <AddCard title="+ Ajouter une échéance">
            <NewMilestoneForm grantProjectId={grantProjectId} />
          </AddCard>
          <AddCard title="+ Ajouter une réclamation">
            <NewClaimForm grantProjectId={grantProjectId} />
          </AddCard>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <SuggestMilestonesButton grantProjectId={grantProjectId} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Échéancier ({entries.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          {entries.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Urgence</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <KindBadge kind={entry.kind} />
                      {entry.origin && <span className="ml-2 text-[11px] text-neutral-400">{entry.origin}</span>}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {entry.title}
                      {entry.subtitle && <span className="ml-2 text-xs text-neutral-400">{entry.subtitle}</span>}
                      {entry.estimated && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">estimée</span>}
                      {entry.missingCount != null && entry.missingCount > 0 && (
                        <span className="ml-2 text-[11px] font-medium text-red-600">
                          {entry.missingCount} élément{entry.missingCount > 1 ? "s" : ""} manquant{entry.missingCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-600">{entry.date ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBucketBadgeClass(entry.bucket)}`}>{PRIORITY_BUCKET_LABELS[entry.bucket]}</span>
                    </td>
                    <td className="px-4 py-2">
                      {entry.kind === "task" && <TaskStatusSelect grantProjectId={grantProjectId} taskId={entry.id} status={entry.status} />}
                      {entry.kind === "milestone" && <MilestoneStatusSelect grantProjectId={grantProjectId} milestoneId={entry.id} status={entry.status} />}
                      {entry.kind === "claim" && <ClaimStatusSelect grantProjectId={grantProjectId} claimId={entry.id} status={entry.status} />}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <DeleteScheduleItemButton
                        grantProjectId={grantProjectId}
                        kind={entry.kind}
                        id={entry.id}
                        confirmText={deleteConfirmText(entry.kind, { title: entry.title, status: entry.status, statusLabel: entry.statusLabel, auto: entry.kind === "milestone" ? entry.estimated : entry.kind === "claim" ? isAutoClaimNumber(entry.title) : false })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Rien à faire pour l&apos;instant. Ajoute une tâche, une échéance ou une réclamation ci-dessus, ou clique « Suggérer l&apos;échéancier » si une entente est enregistrée.</p>
          )}
        </div>
        {closedCount > 0 && (
          <details className="rounded-lg border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-neutral-800">Échéances et réclamations terminées ou annulées ({closedCount})</summary>
            <p className="mt-2 text-xs text-neutral-500">Retirées de l&apos;échéancier mais conservées pour l&apos;historique. Tu peux les rouvrir (changer le statut) ou les supprimer.</p>
            <ul className="mt-3 space-y-2">
              {closedMilestones.map((m) => (
                <li key={`m-${m.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                  <div className="min-w-0 text-sm">
                    <KindBadge kind="milestone" /> <span className="ml-2 text-neutral-900">{m.title}</span>
                    <span className="ml-2 text-xs text-neutral-400">{m.internal_due_date ?? "sans date"}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${milestoneStatusBadgeClass(m.status)}`}>{MILESTONE_STATUS_LABELS[m.status] ?? m.status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MilestoneStatusSelect grantProjectId={grantProjectId} milestoneId={m.id} status={m.status} />
                    <DeleteScheduleItemButton grantProjectId={grantProjectId} kind="milestone" id={m.id} confirmText={deleteConfirmText("milestone", { title: m.title, auto: isAutoMilestone(m.source) })} />
                  </div>
                </li>
              ))}
              {closedClaims.map((c) => (
                <li key={`c-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3">
                  <div className="min-w-0 text-sm">
                    <KindBadge kind="claim" /> <span className="ml-2 text-neutral-900">{claimLabel(c)}</span>
                    <span className="ml-2 text-xs text-neutral-400">{c.due_date ?? "sans date"}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${claimStatusBadgeClass(c.status)}`}>{CLAIM_STATUS_LABELS[c.status] ?? c.status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ClaimStatusSelect grantProjectId={grantProjectId} claimId={c.id} status={c.status} />
                    <DeleteScheduleItemButton grantProjectId={grantProjectId} kind="claim" id={c.id} confirmText={deleteConfirmText("claim", { title: claimLabel(c), status: c.status, statusLabel: CLAIM_STATUS_LABELS[c.status], auto: isAutoClaimNumber(c.claim_number) })} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Tâches</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          {tasks.length > 0 ? (
            <TasksManager grantProjectId={grantProjectId} tasks={tasks} assignees={assignees} />
          ) : (
            <p className="text-sm text-neutral-400">Aucune tâche pour ce dossier. Utilise « + Ajouter une tâche » ci-dessus.</p>
          )}
        </div>
      </section>
    </div>
  );
}
