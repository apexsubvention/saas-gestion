"use server";

import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { documentsService } from "@/server/services/documents.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { tasksService } from "@/server/services/tasks.service";
import { TASK_PRIORITY_LABELS } from "@/features/grants/constants";
import type { SupplierDossierView } from "@/server/repositories/projectSuppliers.repository";
import type { DocumentRow } from "@/server/repositories/documents.repository";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
import type { BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import type { PortalTaskView } from "@/server/services/portalDossiers.service";
import { formatCaughtError } from "@/lib/errors";

// Détails d'un dossier pour un compte fournisseur (0047) -- chargés à la demande (quand la
// carte "Facturation à préparer" est dépliée), pas au chargement de la page d'accueil :
// budget/portion subvention/facturation propre viennent de la RPC portal_supplier_dossier_view
// (renvoie null = aucune ligne = accès refusé -- can_access_grant_project_as_supplier a
// échoué, ex. le compte n'est en fait plus listé comme fournisseur sur ce dossier), et la
// liste des documents vient de documents_select_portal_supplier (RLS, 0047) -- même service
// que côté personnel, la RLS fait le filtrage.
export type SupplierDossierDetails = {
  view: SupplierDossierView | null;
  documents: DocumentRow[];
  // Postes budgétaires/activités acceptés (module/tâche + heures) -- ce qui doit être inscrit sur
  // les factures, déjà extrait de la convention côté interne (0042/0048). Lecture seule.
  billingLineItems: BillingLineItemRow[];
  // Calendrier de facturation : montant et texte de facture déjà répartis par versement/réclamation
  // (0042/0049). Lecture seule -- répond directement au besoin « montant + travaux effectués ».
  billingInstallments: BillingInstallmentRow[];
  // 0069 -- tâches (table tasks) attribuées explicitement à CE fournisseur inscrit sur ce
  // dossier ET rendues visibles dans son portail -- tasks_portal_select (0069) filtre déjà,
  // même liste que dossier.tasks côté client (PortalDossier), mais chargée ici (à la demande)
  // plutôt qu'au chargement de la page d'accueil, comme le reste de cette carte.
  tasks: PortalTaskView[];
  error: string | null;
};

export async function getSupplierDossierDetailsAction(grantProjectId: string): Promise<SupplierDossierDetails> {
  await requirePortalContext();
  const supabase = await createClient();
  try {
    const [view, documents, billingLineItems, billingInstallments, taskRows] = await Promise.all([
      projectSuppliersService(supabase).getSupplierDossierView(grantProjectId),
      documentsService(supabase).listByProject(grantProjectId),
      billingLineItemsService(supabase).listByProject(grantProjectId),
      billingInstallmentsService(supabase).listByProject(grantProjectId),
      tasksService(supabase).listByProject(grantProjectId),
    ]);
    if (!view) {
      return { view: null, documents: [], billingLineItems: [], billingInstallments: [], tasks: [], error: "Ce dossier n'est plus accessible." };
    }
    const tasks: PortalTaskView[] = taskRows
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.due_date,
        priority: t.priority,
        priorityLabel: TASK_PRIORITY_LABELS[t.priority] ?? t.priority,
        status: t.status,
      }));
    return { view, documents, billingLineItems, billingInstallments, tasks, error: null };
  } catch (e) {
    return { view: null, documents: [], billingLineItems: [], billingInstallments: [], tasks: [], error: formatCaughtError(e) };
  }
}
