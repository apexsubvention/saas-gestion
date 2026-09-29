"use server";

import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { documentsService } from "@/server/services/documents.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { tasksService } from "@/server/services/tasks.service";
import { documentRequestsService } from "@/server/services/documentRequests.service";
import { TASK_PRIORITY_LABELS, DOCUMENT_REQUEST_STATUS_LABELS } from "@/features/grants/constants";
import type { SupplierDossierView } from "@/server/repositories/projectSuppliers.repository";
import type { DocumentRow } from "@/server/repositories/documents.repository";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
import type { BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import type { DocumentRequestRow } from "@/server/repositories/documentRequests.repository";
import type { PortalTaskView, PortalDocumentRequestView } from "@/server/services/portalDossiers.service";
import { formatCaughtError } from "@/lib/errors";
import { documentsRepository } from "@/server/repositories/documents.repository";

// 0070 -- mêmes statuts montrés au portail que portalDossiers.service.ts (jamais "not_required"/
// "not_requested") -- dupliqué ici plutôt qu'exporté depuis ce fichier interne, pour rester
// cohérent avec le style déjà établi de ce fichier (constantes locales à chaque service portail).
const VISIBLE_REQUEST_STATUSES = ["requested", "received", "validated", "issue"];

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
  // 0070 -- demandes (table document_requests) attribuées explicitement à CE fournisseur inscrit
  // (document_requests_portal_select filtre déjà) -- même liste que dossier.documentRequests côté
  // client, chargée ici à la demande comme le reste de cette carte.
  documentRequests: PortalDocumentRequestView[];
  error: string | null;
};

const EMPTY_DETAILS: Omit<SupplierDossierDetails, "error"> = {
  view: null,
  documents: [],
  billingLineItems: [],
  billingInstallments: [],
  tasks: [],
  documentRequests: [],
};

export async function getSupplierDossierDetailsAction(grantProjectId: string): Promise<SupplierDossierDetails> {
  await requirePortalContext();
  const supabase = await createClient();
  try {
    const [view, documents, billingLineItems, billingInstallments, taskRows, requestRows] = await Promise.all([
      projectSuppliersService(supabase).getSupplierDossierView(grantProjectId),
      documentsService(supabase).listByProject(grantProjectId),
      billingLineItemsService(supabase).listByProject(grantProjectId),
      billingInstallmentsService(supabase).listByProject(grantProjectId),
      tasksService(supabase).listByProject(grantProjectId),
      documentRequestsService(supabase).listByProject(grantProjectId),
    ]);
    if (!view) {
      return { ...EMPTY_DETAILS, error: "Ce dossier n'est plus accessible." };
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
    // document_requests_portal_select (0070) a déjà filtré aux demandes visibles pour CE compte --
    // on retire seulement (défense) celles hors des statuts montrés au portail, même filtre que
    // portalDossiers.service.ts.
    const visibleRequests: DocumentRequestRow[] = requestRows.filter((r) => r.visible_in_client_portal && VISIBLE_REQUEST_STATUSES.includes(r.status));
    const requestLinks = await documentsRepository(supabase).listDocumentRequestLinks(visibleRequests.map((r) => r.id));
    const filenameByRequestId = new Map(requestLinks.map((l) => [l.request_id, l.filename]));
    const documentRequests: PortalDocumentRequestView[] = visibleRequests.map((r) => ({
      id: r.id,
      title: r.title,
      instructions: r.instructions,
      documentType: r.document_type,
      dueDate: r.due_date,
      status: r.status,
      statusLabel: DOCUMENT_REQUEST_STATUS_LABELS[r.status] ?? r.status,
      filename: filenameByRequestId.get(r.id) ?? null,
      requiresUpload: r.requires_upload,
    }));
    return { view, documents, billingLineItems, billingInstallments, tasks, documentRequests, error: null };
  } catch (e) {
    return { ...EMPTY_DETAILS, error: formatCaughtError(e) };
  }
}
