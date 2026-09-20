import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { claimsListAll } from "@/server/repositories/claims.repository";
import { milestonesListAll } from "@/server/repositories/milestones.repository";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  taskStatusBadgeClass,
  CLAIM_STATUS_LABELS,
  claimStatusBadgeClass,
  MILESTONE_STATUS_LABELS,
  milestoneStatusBadgeClass,
} from "@/features/grants/constants";

// Vue globale (lecture seule) de l'échéancier : tâches, réclamations et échéances de
// convention de tous les dossiers, réunies en une seule liste triée par date -- même
// logique de fusion que sur la fiche d'un dossier (voir grants/[id]/page.tsx). La
// création et le changement de statut se font depuis la fiche du dossier concerné.
export default async function EcheancierPage() {
  const supabase = await createClient();
  const [tasks, claims, milestones] = await Promise.all([
    tasksListAll(supabase)(),
    claimsListAll(supabase)(),
    milestonesListAll(supabase)(),
  ]);

  type Row = {
    kind: "task" | "claim" | "milestone";
    date: string | null;
    title: string;
    subtitle: string;
    statusLabel: string;
    statusClass: string;
    href: string;
    estimated?: boolean;
  };

  const rows: Row[] = [
    ...(tasks ?? []).map((t: any): Row => ({
      kind: "task",
      date: t.due_date,
      title: t.title,
      subtitle: t.grant_projects?.clients?.name ?? t.clients?.name ?? "—",
      statusLabel: TASK_STATUS_LABELS[t.status] ?? t.status,
      statusClass: taskStatusBadgeClass(t.status),
      href: t.grant_project_id ? `/grants/${t.grant_project_id}` : t.client_id ? `/clients/${t.client_id}` : "#",
    })),
    ...(claims ?? []).map((c: any): Row => ({
      kind: "claim",
      date: c.due_date,
      title: c.claim_number || "Réclamation",
      subtitle: c.grant_projects?.clients?.name ?? "—",
      statusLabel: CLAIM_STATUS_LABELS[c.status] ?? c.status,
      statusClass: claimStatusBadgeClass(c.status),
      href: `/grants/${c.grant_project_id}`,
    })),
    ...(milestones ?? []).map((m: any): Row => ({
      kind: "milestone",
      date: m.internal_due_date,
      title: m.title,
      subtitle: m.grant_projects?.clients?.name ?? "—",
      statusLabel: MILESTONE_STATUS_LABELS[m.status] ?? m.status,
      statusClass: milestoneStatusBadgeClass(m.status),
      href: `/grants/${m.grant_project_id}`,
      estimated: m.source === "ai_proposed",
    })),
  ].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  const kindBadge: Record<Row["kind"], string> = {
    task: "bg-slate-100 text-slate-700",
    milestone: "bg-indigo-50 text-indigo-700",
    claim: "bg-emerald-50 text-emerald-700",
  };
  const kindLabel: Record<Row["kind"], string> = {
    task: "Tâche",
    milestone: "Échéance",
    claim: "Réclamation",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Échéancier</h1>
      <p className="text-sm text-neutral-500">
        Vue globale (lecture seule) des tâches actives, réclamations et échéances de convention, tous dossiers
        confondus. La création, la validation des échéances estimées et le changement de statut se font depuis la
        fiche du dossier concerné.
      </p>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Client / Dossier</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Rien pour l&apos;instant.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${i}`} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${kindBadge[r.kind]}`}>
                    {kindLabel[r.kind]}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-900">
                  <Link href={r.href} className="hover:underline">
                    {r.title}
                  </Link>
                  {r.estimated && (
                    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      estimée
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-600">{r.subtitle}</td>
                <td className="px-4 py-2 text-neutral-600">{r.date ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.statusClass}`}>
                    {r.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
