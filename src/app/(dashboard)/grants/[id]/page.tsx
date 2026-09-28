import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { claimsService } from "@/server/services/claims.service";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { clientsService } from "@/server/services/clients.service";
import { claimRequirementsService } from "@/server/services/claimRequirements.service";
import { documentRequestsService } from "@/server/services/documentRequests.service";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { buildScheduleRows } from "@/features/schedule/buildScheduleRows";
import { StatusSelect } from "./StatusSelect";
import { UploadProjectDocumentForm } from "./UploadProjectDocumentForm";
import { OpenDocumentButton } from "./OpenDocumentButton";
import { AgreementForm } from "./AgreementForm";
import { SuppliersTable } from "./SuppliersTable";
import { SubsidyPanel } from "./SubsidyPanel";
import { DossierTimeline } from "./DossierTimeline";
import { SchedulePanel } from "./SchedulePanel";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { ProgramRulesSnapshot } from "./ProgramRulesSnapshot";
import { programSnapshotService } from "@/server/services/programSnapshot.service";
import { programsRepository } from "@/server/repositories/programs.repository";
import { aiSuggestionsService } from "@/server/services/aiSuggestions.service";
import { listDossierEvents } from "@/server/services/audit";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { budgetLinesService } from "@/server/services/budgetLines.service";
import { BudgetDeposeSection } from "./BudgetDeposeSection";
import { computeSubsidy, resolveSubsidyInputs } from "@/features/grants/subsidyMath";
import { buildBillingNarrative } from "@/features/billing/billingSummary";
import { computePaymentDeadline, paymentDeadlineAlertText } from "@/features/billing/paymentDeadline";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { NewSupplierForm } from "./NewSupplierForm";
import { DeleteGrantProjectButton } from "../DeleteGrantProjectButton";
import { NewDocumentRequestForm } from "./NewDocumentRequestForm";
import { DocumentRequestsList, type DocumentRequestListItem } from "./DocumentRequestsList";
import { dossierNotesService } from "@/server/services/dossierNotes.service";
import { DossierNotes } from "./DossierNotes";
import { HideFromParentPortalToggle } from "./HideFromParentPortalToggle";
import { RequiresPaymentProofToggle } from "./RequiresPaymentProofToggle";
import { EditableGrantProjectName } from "./EditableGrantProjectName";
import { DocumentCategorySelect } from "./DocumentCategorySelect";
import { DeleteDocumentButton } from "./DeleteDocumentButton";
import { PariBalance } from "./PariBalance";
import { isPariCnrcProgram } from "@/server/scheduling/monthlyClaims";

// Le téléversement d'une facture déclenche sa lecture automatique (jusqu'à ~1 min).
export const maxDuration = 60;

// Jade : la fiche dossier était devenue une trop longue page à faire défiler -- les sections
// consultées moins souvent (Documents demandés au client, Notes partagées, Entente de
// convention, Règles du programme, Journal du dossier) sont repliées par défaut, avec un
// indicateur de contenu dans l'intitulé pour savoir d'un coup d'œil s'il y a quelque chose à
// voir sans avoir à ouvrir. <details>/<summary> natif (déjà utilisé ailleurs sur cette page,
// ex. « Ajouter un fournisseur ») -- pas de JS nécessaire pour ouvrir/fermer.
function CollapsibleSection({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-neutral-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-900">
        {title}
        {badge && <span className="ml-2 text-xs font-normal text-neutral-400">{badge}</span>}
      </summary>
      <div className="space-y-3 border-t border-neutral-200 p-4">{children}</div>
    </details>
  );
}

export default async function GrantProjectPage({ params, searchParams }: { params: { id: string }; searchParams?: { tab?: string } }) {
  const tab = searchParams?.tab === "echeancier" ? "echeancier" : "dossier";
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(params.id);

  if (!project) notFound();

  // Jade (0069) : « il faut que l'entête du dossier se mette à jour avec la portion fournisseur et
  // factures ». L'en-tête (Dépensé/Réclamé/Payé/Solde) lisait jusqu'ici budget_line_actuals --
  // une table qu'aucun code de l'application n'écrit plus nulle part (vérifié -- vestige d'une
  // ancienne version du suivi budgétaire, avant le tableau Fournisseurs et factures actuel) : elle
  // reste donc TOUJOURS à 0, peu importe les vraies factures. Remplacé plus bas par `ledger`
  // (supplierLedgerService.load(), déjà chargé pour le tableau Fournisseurs et le panneau de
  // subvention juste en dessous) -- la même source de vérité partout sur cette page, jamais
  // recalculée séparément.

  const [documents, claims, tasks, milestones, allClients, agreements] = await Promise.all([
    documentsService(supabase).listByProject(params.id),
    claimsService(supabase).listByProject(params.id),
    tasksService(supabase).listByProject(params.id),
    milestonesService(supabase).listByProject(params.id),
    clientsService(supabase).list(),
    grantAgreementsService(supabase).listByProject(params.id),
  ]);
  const agreement = agreements[0] ?? null;
  const rateForLedger = Number(project.grant_rate ?? agreement?.grant_rate ?? 0) || null;
  // Jade (0065) : vocabulaire "salarié interne"/DDR adapté au tableau Fournisseurs pour ce
  // programme -- même signal que le calendrier de réclamations mensuelles (isMonthlyClaimProgram),
  // jamais imposé (toujours modifiable par ligne, voir SuppliersTable.tsx).
  const isPariProgram = isPariCnrcProgram(project.grant_programs?.name ?? null);
  // netOfRate (isPariProgram) : voir le commentaire sur load() dans supplierLedger.service.ts --
  // pour ces dossiers, claimed vient du DDR et est déjà net, jamais retraduit par le taux.
  const ledger = await supplierLedgerService(supabase).load(params.id, rateForLedger, isPariProgram);
  const lineItems = await billingLineItemsService(supabase).listByProject(params.id);
  const budgetLines = await budgetLinesService(supabase).load(params.id);
  // Résumé seulement dans le Dossier (Jade : trop de tableaux qui se ressemblent) -- le détail
  // éditable (cocher/décocher, raison d'exclusion) reste dans l'onglet Aide à la facturation.
  const lineItemsSummary = {
    includedCount: lineItems.filter((it) => it.included_in_billing).length,
    excludedCount: lineItems.filter((it) => !it.included_in_billing).length,
    includedTotal: lineItems.filter((it) => it.included_in_billing).reduce((sum, it) => sum + Number(it.amount ?? 0), 0),
  };
  const dossierEvents = await listDossierEvents(supabase, params.id);
  const suggestions = await aiSuggestionsService(supabase).listProposed(params.id);
  const [snapshots, currentProgram] = await Promise.all([programSnapshotService(supabase).list(params.id), programsRepository(supabase).findById(project.program_id)]);
  const { data: staffRows } = await supabase.from("organization_users").select("id, full_name, email").eq("active", true).in("role", ["admin", "employee"]);
  const assignees = (staffRows ?? []).map((u) => ({ id: u.id, name: u.full_name || u.email || "Membre de l'équipe" }));
  // Jade (PARI CNRC/IRAP, suite à 0065) : ledger.spent est ici la somme des DDR, déjà NETTE
  // (montant accepté/remboursé par le PARI après son propre taux de soutien) -- ne pas réappliquer
  // le taux d'aide du dossier par-dessus, sinon la subvention restante est sous-évaluée (le taux
  // est appliqué deux fois). Voir subsidyMath.ts#netOfRate.
  const subsidy = computeSubsidy({ ...resolveSubsidyInputs(project, agreement, ledger.spent), netOfRate: isPariProgram });
  // Résumé en langage clair (demandé par Jade) : à partir des mêmes chiffres que SubsidyPanel,
  // mais en phrase plutôt qu'en tableau. deadline = date de fin du projet (entente en priorité,
  // sinon fiche du dossier -- même ordre que "Dates du projet" sur la page Facturation).
  const clientName = project.clients?.name ?? "Le client";
  const projectDeadline = agreement?.project_end ?? project.official_end_date ?? null;
  // Jade : alerte SÉPARÉE (jamais fondue dans les phrases de résumé ci-dessous) sur le délai de
  // paiement/facturation lu dans la convention -- date fixe, ou délai de grâce en jours après la
  // fin du projet, sinon repli sur la fin du projet elle-même (règle par défaut, expliquée dans le
  // texte). Même calcul affiché à l'identique côté portail (parent et fournisseur/enfant).
  const paymentDeadline = computePaymentDeadline({
    projectEnd: projectDeadline,
    paymentDeadlineDate: agreement?.payment_deadline_date ?? null,
    paymentDeadlineDaysAfterEnd: agreement?.payment_deadline_days_after_end ?? null,
  });
  const paymentDeadlineText = paymentDeadlineAlertText(paymentDeadline, agreement?.payment_deadline_days_after_end ?? null);
  // Jade (0059) : ce qui sera VRAIMENT facturé, ce sont les postes cochés "À facturer" dans Aide à
  // la facturation -- jamais le coût total du projet (qui inclut les coûts internes, ex. salaire,
  // jamais facturés par personne). Dès que des postes existent, on utilise leur somme plutôt que
  // le coût total ; sinon (dossier tout juste créé, aucun poste encore extrait/saisi) on retombe
  // sur l'ancien calcul (coût total requis pour atteindre la subvention).
  const billableFromItems = lineItems.length > 0 ? lineItemsSummary.includedTotal : null;
  const excludedFromItems = lineItems.length > 0 ? lineItems.filter((it) => !it.included_in_billing).reduce((sum, it) => sum + Number(it.amount ?? 0), 0) : null;
  const billingNarrative = buildBillingNarrative({
    clientName,
    subsidy,
    billerLabel: null,
    billerAmount: billableFromItems ?? subsidy.requiredSpend,
    deadline: projectDeadline,
    excludedAmount: excludedFromItems,
  });
  const otherClients = allClients.filter((c) => c.id !== project.client_id);

  const pendingMilestones = milestones.filter((m) => m.status === "pending" || m.status === "at_risk");
  const nextMilestone = pendingMilestones[0] ?? null;

  // Jade (0072) : « l'entête ne se met pas à jour automatiquement quand je rentre des dépenses,
  // factures » -- "Approuvé" lisait UNIQUEMENT project.approved_grant_amount (un champ saisi à la
  // main, souvent jamais rempli quand l'entente donne déjà le montant), ignorant le repli sur
  // agreement.grant_amount que `subsidy` (ci-dessus, resolveSubsidyInputs) applique déjà et que
  // "Subvention maximale" affiche juste en dessous (SubsidyPanel) -- d'où un en-tête à 0 $ à côté
  // d'un panneau à 13 463 $ pour le même dossier. subsidy.maxSubsidy est la même valeur déjà
  // résolue avec la bonne priorité (fiche du dossier > entente) : plus de deuxième calcul à côté.
  const approved = subsidy.maxSubsidy ?? Number(project.approved_grant_amount ?? 0);
  // Jade : pour un dossier PARI, "Solde" (en haut) doit toujours refléter la même source que
  // l'encadré vert "Solde restant PARI" -- project.pari_balance_remaining, lu directement sur le
  // rapport Historique DDR (solde officiel du programme pour l'exercice financier), pas recalculé
  // par Apex. subsidy.remaining (entente : taux x montant approuvé) suppose une entente PARI
  // renseignée dans Apex -- souvent absente/pas encore saisie pour ces dossiers (montant approuvé
  // à 0 dans l'en-tête) -- donc ne pas s'y fier comme source principale : elle ne sert que de repli
  // tant qu'aucun rapport DDR n'a encore été lu (pari_balance_remaining est alors null).
  //
  // Pour un dossier NON PARI (0072, puis corrigé) : "Solde" bouge dès qu'une dépense/facture est
  // ajoutée (ledger.totals.earned, basé sur facturé), sans attendre une réclamation formelle --
  // MAIS avec le taux propre de chaque poste du Tableau 1/2 (85 % ici, 100 % là) plutôt qu'un
  // seul taux global (subsidy.remaining/project.grant_rate) appliqué en bloc à tout le dossier,
  // qui mélangeait des postes à taux différents. Jade (test réel, poste Formation employeur à
  // 85 % vs taux global du dossier à 100 %) : les deux pouvaient diverger significativement --
  // ledger.totals.earned suit maintenant la même précision par poste que le Tableau 2. Peut donc
  // légitimement différer de "Subvention restante" dans SubsidyPanel juste en dessous (qui reste
  // au taux global, plus simple, utile tant qu'aucun poste détaillé n'existe) -- ce n'est plus une
  // erreur de synchronisation, juste deux questions différentes (taux global vs réel par poste).
  // approved - earned peut dépasser 0 même à earned négatif ou nul -- jamais un Solde à 0 $ alors
  // qu'un montant approuvé existe déjà (même garde-fou que pour "Approuvé" ci-dessus).
  const balance = isPariProgram
    ? project.pari_balance_remaining ?? subsidy.remaining
    : Math.max(0, Math.round((approved - ledger.totals.earned) * 100) / 100);

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

  // Documents demandés au client (téléversés depuis le portail -- voir
  // src/app/(portal)/portal/(app)/actions.ts) : une seule requête groupée pour associer
  // le fichier reçu, s'il y en a un, à chaque demande.
  const documentRequests = await documentRequestsService(supabase).listByProject(params.id);
  const dossierNotes = await dossierNotesService(supabase).listByProject(params.id);
  const requestLinks = await documentsRepository(supabase).listDocumentRequestLinks(documentRequests.map((r) => r.id));
  const linkByRequestId = new Map(requestLinks.map((l) => [l.request_id, l]));
  const claimLabelById = new Map(claims.map((c) => [c.id, c.claim_number || `Réclamation (${c.period_start ?? "—"})`]));
  const documentRequestItems: DocumentRequestListItem[] = documentRequests.map((r) => {
    const file = linkByRequestId.get(r.id);
    return {
      id: r.id,
      title: r.title,
      instructions: r.instructions,
      documentType: r.document_type,
      dueDate: r.due_date,
      status: r.status,
      claimLabel: r.claim_id ? (claimLabelById.get(r.claim_id) ?? null) : null,
      file: file ? { filename: file.filename, storagePath: file.storage_path } : null,
      requiresUpload: r.requires_upload,
    };
  });
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
        <EditableGrantProjectName grantProjectId={project.id} initialName={project.name} />
        {project.clients?.parent_client_id && (
          <div className="mt-2">
            <HideFromParentPortalToggle grantProjectId={project.id} initialHidden={Boolean(project.hidden_from_parent_portal)} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/grants/${project.id}/redaction`} className="inline-block rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            Aide à la rédaction →
          </Link>
          <Link href={`/grants/${project.id}/facturation`} className="inline-block rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100">
            Aide à la facturation →
          </Link>
          {isPariProgram && (
            <Link href={`/grants/${project.id}/ddr`} className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
              DDR (PARI CNRC) →
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-neutral-400">Statut de la subvention</p>
            <div className="mt-1">
              <StatusSelect grantProjectId={project.id} status={project.status} />
            </div>
          </div>
          <Metric label="Approuvé" value={money(approved)} />
          {/* Jade : renommé de "Dépensé" à "Facturé" -- c'est la somme de TOUTES les factures
              avant taxes (ledger.spent), peu importe si elles sont payées à ton fournisseur ou
              non ; "Payé" juste à côté n'en est qu'un sous-ensemble (les factures marquées
              "Payée"), pas la même donnée sous un autre nom. */}
          <Metric label="Facturé" value={money(ledger.spent)} />
          {/* Jade : "Réclamé" reste le coût admissible tel qu'inscrit sur le vrai formulaire de
              réclamation (ledger.totals.claimed, jamais converti) -- même distinction qu'au
              Tableau 2, voir supplierLedger.service.ts. Repère "≈ X $ de subvention" ajouté ici
              pour la même raison (voir le montant qui alimente réellement Solde), masqué quand ça
              ne change rien (rien claimed encore, ou taux à 100 %). */}
          <Metric
            label="Réclamé"
            value={money(ledger.totals.claimed)}
            hint={
              ledger.totals.claimed !== 0 && Math.abs(ledger.totals.claimedSubsidyEquivalent - ledger.totals.claimed) > 0.01
                ? `≈ ${money(ledger.totals.claimedSubsidyEquivalent)} de subvention`
                : undefined
            }
          />
          <Metric label="Payé" value={money(ledger.paid)} />
          <Metric label="Solde" value={money(balance)} />
          <Metric
            label="Prochaine échéance"
            value={nextMilestone ? `${nextMilestone.title} (${nextMilestone.internal_due_date ?? "—"})` : "Aucune"}
          />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200" aria-label="Sections du dossier">
        {[
          { id: "dossier", label: "Dossier", href: `/grants/${project.id}` },
          { id: "echeancier", label: `Échéanciers & tâches (${scheduleEntries.length})`, href: `/grants/${project.id}?tab=echeancier` },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            scroll={false}
            aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "echeancier" ? (
        <SchedulePanel
          grantProjectId={project.id}
          clientId={project.client_id}
          entries={scheduleEntries}
          tasks={tasks}
          milestones={milestones}
          claims={claims}
          assignees={assignees}
        />
      ) : (
        <>
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
                        <td className="px-4 py-2">
                          <DocumentCategorySelect grantProjectId={project.id} documentId={d.id} initialCategory={d.category} />
                        </td>
                        <td className="px-4 py-2 text-neutral-400">{new Date(d.created_at).toLocaleDateString("fr-CA")}</td>
                        <td className="px-4 py-2 text-right">
                          <span className="inline-flex items-center gap-3">
                            <OpenDocumentButton storagePath={d.storage_path} filename={d.filename} />
                            {ctx.role === "admin" && (
                              <DeleteDocumentButton grantProjectId={project.id} documentId={d.id} storagePath={d.storage_path} filename={d.filename} />
                            )}
                          </span>
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

          <CollapsibleSection title="Tâches à faire pour le client" badge={`(${documentRequestItems.length})`}>
            <p className="text-xs text-neutral-500">
              Demande une tâche au client (fournir un document précis, ou simplement une action à confirmer) —
              visible depuis son portail, pour un dépôt de programme ou pour une réclamation précise. Décoche
              « Téléversement d&apos;un document requis » si le client n&apos;a qu&apos;à cocher la tâche
              comme faite, sans fichier à fournir.
            </p>
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <NewDocumentRequestForm
                grantProjectId={project.id}
                clientId={project.client_id}
                claims={claims.map((c) => ({ id: c.id, label: c.claim_number || `Réclamation (${c.period_start ?? "—"})` }))}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <DocumentRequestsList grantProjectId={project.id} items={documentRequestItems} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Notes partagées avec le client" badge={`(${dossierNotes.length})`}>
            <DossierNotes grantProjectId={project.id} clientId={project.client_id} notes={dossierNotes} />
          </CollapsibleSection>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-900">Fournisseurs et factures</h2>
            <RequiresPaymentProofToggle grantProjectId={project.id} initialRequired={project.requires_payment_proof} />
            {isPariProgram && (
              <PariBalance
                grantProjectId={project.id}
                initialRemaining={project.pari_balance_remaining}
                initialLabel={project.pari_balance_label}
                initialUpdatedAt={project.pari_balance_updated_at}
              />
            )}
            <SuggestionsPanel grantProjectId={project.id} suggestions={suggestions} />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-900">Ce qui a été déposé</h3>
              <BudgetDeposeSection
                grantProjectId={project.id}
                lines={budgetLines.lines}
                totals={budgetLines.totals}
                suppliers={ledger.suppliers.map((s) => ({ id: s.id, name: s.name }))}
                totalProjectCost={project.total_project_cost != null ? Number(project.total_project_cost) : null}
                approvedGrantAmount={subsidy.maxSubsidy}
                grantRatePercent={subsidy.rate != null ? Math.round(subsidy.rate * 10000) / 100 : null}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-900">Suivi budgétaire</h3>
              {paymentDeadlineText && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
                  <p className="font-semibold">⏰ Délai de paiement et de facturation</p>
                  <p className="mt-1">{paymentDeadlineText}</p>
                </div>
              )}
              <SubsidyPanel summary={subsidy} supplierBudgetTotal={ledger.supplierBudgetTotal} narrative={billingNarrative} netOfRate={isPariProgram} />
              <p className="text-xs text-neutral-500">
                Ce qui a été dépensé et réclamé, fournisseur par fournisseur (salariés internes inclus, même sans facture). Un seul tableau, automatique et
                manuel : modifie, ajoute ou supprime les fournisseurs (ou salariés), même ceux générés automatiquement. Une facture téléversée dans
                « Documents » (catégorie Facture) est lue automatiquement et ajoutée ici sous son fournisseur ; tu peux aussi associer un document
                toi-même. Quand un poste correspondant existe dans « Ce qui a été déposé » ci-dessus, il est indiqué sous le nom du fournisseur et alimente
                sa subvention acceptée. Ouvre « Détails » sur un fournisseur pour voir l&apos;historique de ses modifications.
                {isPariProgram && " Pour un rapport « Historique DDR », choisis la catégorie « Rapport DDR » -- Apex y lit les salariés, heures, taux et le solde restant, et les ajoute ci-dessous par DDR."}
              </p>
              {lineItems.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="text-sm text-neutral-700">
                    <span className="font-medium text-neutral-900">Activités et postes budgétaires acceptés</span> (repris de la convention) :{" "}
                    {lineItemsSummary.includedCount} à facturer ({money(lineItemsSummary.includedTotal)})
                    {lineItemsSummary.excludedCount > 0 ? `, ${lineItemsSummary.excludedCount} exclu(s)` : ""}.
                  </p>
                  <Link
                    href={`/grants/${project.id}/facturation`}
                    className="inline-block whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
                  >
                    Voir / cocher le détail →
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  Aucune activité/poste budgétaire détecté pour l&apos;instant -- téléverse la convention dans « Documents », ou ajoute-les toi-même
                  dans{" "}
                  <Link href={`/grants/${project.id}/facturation`} className="underline hover:text-neutral-600">
                    Aide à la facturation
                  </Link>
                  .
                </p>
              )}
              <SuppliersTable
                grantProjectId={project.id}
                suppliers={ledger.suppliers}
                unassigned={ledger.unassigned}
                documents={documents.map((d) => ({ id: d.id, filename: d.filename, category: d.category }))}
                clients={allClients.map((c) => ({ id: c.id, name: c.name }))}
                claims={claims.map((c) => ({ id: c.id, label: c.claim_number || `Réclamation (${c.period_start ?? "—"})` }))}
                lineItems={lineItems}
                totals={ledger.totals}
                billingContext={{ clientName, subsidy, deadline: projectDeadline }}
              />
              <details className="rounded-lg border border-neutral-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-neutral-800">{isPariProgram ? "Ajouter un salarié ou un fournisseur" : "Ajouter un fournisseur avec ses détails de facturation"}</summary>
                <div className="mt-3">
                  <NewSupplierForm grantProjectId={project.id} clients={otherClients.map((c) => ({ id: c.id, name: c.name }))} suggestEmployee={isPariProgram} />
                </div>
              </details>
            </div>
          </section>

          <CollapsibleSection title="Entente de convention" badge={agreement ? "· Enregistrée" : "· Non enregistrée"}>
            <p className="text-xs text-neutral-500">
              Saisis les dates et montants de l&apos;entente : les dates de réclamation sont alors ajoutées à l&apos;échéancier et le statut du dossier
              devient « Approuvé — en attente de réclamation ».
            </p>
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <AgreementForm grantProjectId={project.id} agreement={agreement} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Règles du programme figées pour ce dossier" badge={snapshots.length > 0 ? `(${snapshots.length})` : "· Aucune"}>
            <ProgramRulesSnapshot grantProjectId={project.id} program={currentProgram} snapshots={snapshots} />
          </CollapsibleSection>

          <CollapsibleSection title="Journal du dossier" badge={`(${dossierEvents.length})`}>
            <DossierTimeline events={dossierEvents} />
          </CollapsibleSection>

          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-400">
            Onglets Application / Budget / Expenses détaillés — arrivent à l&apos;Étape 3 (moteur opérationnel).
          </div>

          {ctx.role === "admin" && (
            <section className="space-y-2 rounded-lg border border-red-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-red-800">Zone dangereuse</h2>
              <p className="text-xs text-neutral-500">
                Supprime définitivement ce dossier : documents, entente, réclamations, échéances, tâches, fournisseurs, questionnaire et journal. Action irréversible.
              </p>
              <DeleteGrantProjectButton grantProjectId={project.id} name={project.name} redirectAfter size="md" />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

function money(n: number) {
  return `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
