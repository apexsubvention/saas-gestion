"use server";

import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { documentsService } from "@/server/services/documents.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import type { SupplierDossierView } from "@/server/repositories/projectSuppliers.repository";
import type { DocumentRow } from "@/server/repositories/documents.repository";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
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
  error: string | null;
};

export async function getSupplierDossierDetailsAction(grantProjectId: string): Promise<SupplierDossierDetails> {
  await requirePortalContext();
  const supabase = await createClient();
  try {
    const [view, documents, billingLineItems] = await Promise.all([
      projectSuppliersService(supabase).getSupplierDossierView(grantProjectId),
      documentsService(supabase).listByProject(grantProjectId),
      billingLineItemsService(supabase).listByProject(grantProjectId),
    ]);
    if (!view) {
      return { view: null, documents: [], billingLineItems: [], error: "Ce dossier n'est plus accessible." };
    }
    return { view, documents, billingLineItems, error: null };
  } catch (e) {
    return { view: null, documents: [], billingLineItems: [], error: formatCaughtError(e) };
  }
}
