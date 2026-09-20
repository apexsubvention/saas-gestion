import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { claimsService } from "@/server/services/claims.service";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { clientsService } from "@/server/services/clients.service";
import { claimRequirementsService } from "@/server/services/claimRequirements.service";
import { buildScheduleRows } from "@/features/schedule/buildScheduleRows";
import { StatusSelect } from "./StatusSelect";
import { UploadProjectDocumentForm } from "./UploadProjectDocumentForm";
import { OpenDocumentButton } from "./OpenDocumentButton";
import { NewClaimForm } from "./NewClaimForm";
import { ClaimStatusSelect } from "./ClaimStatusSelect";
import { NewTaskForm } from "./NewTaskForm";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { MilestoneStatusSelect } from "./MilestoneStatusSelect";
import { DeleteMilestoneButton } from "./DeleteMilestoneButton";
import { SuggestMilestonesButton } from "./SuggestMilestonesButton";
import { NewSupplierForm } from "./NewSupplierForm";
import { DOCUMENT_CATEGORY_LABELS, PRIORITY_BUCKET_LABELS, priorityBucketBadgeClass } from "@/features/grants/constants";

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

  const [documents, claims, tasks, milestones, suppliers, allClients] = await Promise.all([
    documentsService(supabase).listByProject(params.id),
    claimsService(supabase).listByProject(params.id),
    tasksService(supabase).listByProject(params.id),
    milestonesService(supabase).listByProject(params.id),
    projectSuppliersService(supabase).listByProject(params.id),
    clientsService(supabase).list(),
  ]);
  const otherClients = allClients.filter((c) => c.id !== project.client_id);

  const pendingMilestones = milestones.filter((m) => m.status === "pending" || m.status === "at_risk");
  const nextMilestone = pendingMilestones[0] ?? null;

  const approved = Number(project.approved_grant_amount ?? 0);
  const balance = approved - totals.claimed;

  // Échéancier unifié : tâches (manuel), échéances (suggérées ou manuelles depuis
  // l'entente) et réclamations (dossiers réels) forment ensemble UNE liste triée par
  // date, chacune étiquetée pour rester distinguable -- voir la demande de l'utilisateur
  // de fusionner "Tâches" et "Réclamations" en un seul endroit. buildScheduleRows()
  // (src/features/schedule/) est la même fonction que la vue globale /echeancier --
  // context fourni ici car listByProject() n'est pas jointe à grant_projects/clients
  // (déjà connus sur cette page, pas besoin de les redemander).
  const missingCountByClaimId = await claimRequirementsService(supabase).countOpenByClaimIds(
    claims.map((c) => c.id)
  );
  const scheduleEntries = buildScheduleRows({
    tasks,
    milestones,
    claims,
    missingCountByClaimId,
    context: {
      clientName: project.clients?.name ?? null,
      projectName: project.name,
      programName: project.grant_programs?.name ?? null,
    },
  }).sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

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
        <h2 className="text-sm font-semibold text-neutral-900">Fournisseurs</h2>
        <p className="text-xs text-neutral-500">
          Quand un fournisseur est lui-même un client Apex (ex. Sitegrow qui facture pour ses propres clients),
          le lier ci-dessous rend ces informations visibles dans son portail, s&apos;il en a un.
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <NewSupplierForm grantProjectId={project.id} clients={otherClients.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {suppliers.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Budget</th>
                  <th className="px-4 py-2 font-medium">Fréquence</th>
                  <th className="px-4 py-2 font-medium">Jour attendu</th>
                  <th className="px-4 py-2 font-medium">À inscrire sur la facture</th>
                  <th className="px-4 py-2 font-medium">Client Apex lié</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{s.name}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {s.budget_amount != null ? money(Number(s.budget_amount)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{s.billing_frequency ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{s.expected_invoice_day ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{s.invoice_description_requirements ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {s.supplier_client_id ? allClients.find((c) => c.id === s.supplier_client_id)?.name ?? "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Aucun fournisseur pour ce dossier.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Échéancier</h2>
        </div>
        <p className="text-xs text-neutral-500">
          Tâches, réclamations et échéances de l&apos;entente au même endroit. Les échéances marquées « estimée »
          sont calculées à partir des dates de l&apos;entente et doivent être validées ou retirées — ce ne sont pas
          des dates officielles.
        </p>
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <NewTaskForm grantProjectId={project.id} clientId={project.client_id} />
        </div>
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <NewClaimForm grantProjectId={project.id} />
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <SuggestMilestonesButton grantProjectId={project.id} />
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {scheduleEntries.length > 0 ? (
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
                {scheduleEntries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <KindBadge label={SCHEDULE_KIND_LABELS[entry.kind]} className={SCHEDULE_KIND_BADGE[entry.kind]} />
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {entry.title}
                      {entry.subtitle && <span className="ml-2 text-xs text-neutral-400">{entry.subtitle}</span>}
                      {entry.estimated && (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                          estimée
                        </span>
                      )}
                      {entry.missingCount != null && entry.missingCount > 0 && (
                        <span className="ml-2 text-[11px] font-medium text-red-600">
                          {entry.missingCount} élément{entry.missingCount > 1 ? "s" : ""} manquant
                          {entry.missingCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{entry.date ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBucketBadgeClass(entry.bucket)}`}>
                        {PRIORITY_BUCKET_LABELS[entry.bucket]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {entry.kind === "task" && (
                        <TaskStatusSelect grantProjectId={project.id} taskId={entry.id} status={entry.status} />
                      )}
                      {entry.kind === "milestone" && (
                        <MilestoneStatusSelect grantProjectId={project.id} milestoneId={entry.id} status={entry.status} />
                      )}
                      {entry.kind === "claim" && (
                        <ClaimStatusSelect grantProjectId={project.id} claimId={entry.id} status={entry.status} />
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {entry.kind === "milestone" && (
                        <DeleteMilestoneButton grantProjectId={project.id} milestoneId={entry.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">
              Rien pour l&apos;instant. Ajoute une tâche, une réclamation, ou clique « Suggérer l&apos;échéancier » si
              une entente est enregistrée.
            </p>
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

const SCHEDULE_KIND_LABELS = { task: "Tâche", milestone: "Échéance", claim: "Réclamation" } as const;
const SCHEDULE_KIND_BADGE = {
  task: "bg-slate-100 text-slate-700",
  milestone: "bg-indigo-50 text-indigo-700",
  claim: "bg-emerald-50 text-emerald-700",
} as const;

function KindBadge({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{label}</span>;
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
