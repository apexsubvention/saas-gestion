import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { claimsService } from "@/server/services/claims.service";
import { tasksService } from "@/server/services/tasks.service";
import { StatusSelect } from "./StatusSelect";
import { UploadProjectDocumentForm } from "./UploadProjectDocumentForm";
import { OpenDocumentButton } from "./OpenDocumentButton";
import { NewClaimForm } from "./NewClaimForm";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { NewTaskForm } from "./NewTaskForm";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { TASK_PRIORITY_LABELS, DOCUMENT_CATEGORY_LABELS } from "@/features/grants/constants";

export default async function GrantProjectPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(params.id);

  if (!project) notFound();

  // Agrege budget_line_actuals pour ce projet (source de verite = transactions reelles, pas de colonnes stockees).
  const { data: budgetRows } = await supabase
    .from("budget_line_actuals")
    .select("spent_amount, claimed_amount, paid_amount")
    .eq("grant_project_id", params.id);

  const totals = (budgetRows ?? []).reduce(
    (acc: any, r: any) => ({
      spent: acc.spent + Number(r.spent_amount ?? 0),
      claimed: acc.claimed + Number(r.claimed_amount ?? 0),
      paid: acc.paid + Number(r.paid_amount ?? 0),
    }),
    { spent: 0, claimed: 0, paid: 0 }
  );

  const { data: nextMilestone } = await supabase
    .from("milestones")
    .select("title, internal_due_date, official_due_date")
    .eq("grant_project_id", params.id)
    .eq("status", "pending")
    .order("internal_due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [documents, claims, tasks] = await Promise.all([
    documentsService(supabase).listByProject(params.id),
    claimsService(supabase).listByProject(params.id),
    tasksService(supabase).listByProject(params.id),
  ]);

  const approved = Number(project.approved_grant_amount ?? 0);
  const balance = approved - totals.claimed;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          {project.clients?.name} · {project.grant_programs?.name}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">{project.name}</h1>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-neutral-400">Statut de la subvention</p>
            <div className="mt-1">
              <StatusSelect grantProjectId={project.id} status={project.status} />
            </div>
          </div>
          <Metric label="Approuvé" value={money(approved)} />
          <Metric label="Dépensé" value={money(totals.spent)} />
          <Metric label="Réclamé" value={money(totals.claimed)} />
          <Metric label="Payé" value={money(totals.paid)} />
          <Metric label="Solde" value={money(balance)} />
          <Metric
            label="Prochaine échéance"
            value={nextMilestone ? `${nextMilestone.title} (${nextMilestone.internal_due_date ?? "—"})` : "Aucune"}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Documents</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <UploadProjectDocumentForm
            grantProjectId={project.id}
            clientId={project.client_id}
            claims={claims.map((c) => ({ id: c.id, label: c.claim_number || `Réclamation (${c.period_start ?? "—"})` }))}
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {documents.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{d.filename}</td>
                    <td className="px-4 py-2 text-neutral-600">{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</td>
                    <td className="px-4 py-2 text-neutral-400">{new Date(d.created_at).toLocaleDateString("fr-CA")}</td>
                    <td className="px-4 py-2 text-right">
                      <OpenDocumentButton storagePath={d.storage_path} filename={d.filename} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">
              Aucun document. Aucune convention n&apos;a été téléversée pour ce dossier — pense à l&apos;ajouter si elle
              existe déjà en format papier ou courriel.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Réclamations</h2>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <NewClaimForm grantProjectId={project.id} />
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {claims.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Réclamation</th>
                  <th className="px-4 py-2 font-medium">Période</th>
                  <th className="px-4 py-2 font-medium">Échéance</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{c.claim_number || "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {c.period_start ?? "—"} → {c.period_end ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{c.due_date ?? "—"}</td>
                    <td className="px-4 py-2">
                      <ClaimStatusSelect grantProjectId={project.id} claimId={c.id} status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Aucune réclamation créée pour ce dossier.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Tâches</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <NewTaskForm grantProjectId={project.id} clientId={project.client_id} />
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {tasks.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{t.title}</td>
                    <td className="px-4 py-2 text-neutral-600">{TASK_PRIORITY_LABELS[t.priority] ?? t.priority}</td>
                    <td className="px-4 py-2 text-neutral-400">{t.due_date ?? "Aucune échéance"}</td>
                    <td className="px-4 py-2">
                      <TaskStatusSelect grantProjectId={project.id} taskId={t.id} status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Aucune tâche pour ce dossier.</p>
          )}
        </div>
      </section>

      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-400">
        Onglets Application / Agreement / Budget / Expenses détaillés — arrivent à l&apos;Étape 3 (moteur
        opérationnel).
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function money(n: number) {
  return `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
