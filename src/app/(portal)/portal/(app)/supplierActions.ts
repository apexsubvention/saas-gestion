"use server";

import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { documentsService } from "@/server/services/documents.service";
import type { SupplierDossierView } from "@/server/repositories/projectSuppliers.repository";
import type { DocumentRow } from "@/server/repositories/documents.repository";
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
  error: string | null;
};

export async function getSupplierDossierDetailsAction(grantProjectId: string): Promise<SupplierDossierDetails> {
  await requirePortalContext();
  const supabase = await createClient();
  try {
    const [view, documents] = await Promise.all([
      projectSuppliersService(supabase).getSupplierDossierView(grantProjectId),
      documentsService(supabase).listByProject(grantProjectId),
    ]);
    if (!view) {
      return { view: null, documents: [], error: "Ce dossier n'est plus accessible." };
    }
    return { view, documents, error: null };
  } catch (e) {
    return { view: null, documents: [], error: formatCaughtError(e) };
  }
}
