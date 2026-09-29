import type { SupabaseClient } from "@supabase/supabase-js";
import { clientsService } from "@/server/services/clients.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { parseDocumentRequestTargetOptionKey, type DocumentRequestTargetKind } from "./documentRequestTargetOptions";

// 0070 -- résout et VALIDE côté serveur la clé d'attribution soumise par le formulaire
// (NewDocumentRequestForm) en { target_kind, client_id, supplier_id } réels -- jamais faire
// confiance au <select> seul : on revérifie que la cible choisie appartient bien à ce dossier
// (même principe que taskTargetResolve.ts, retiré en 0070). Fichier séparé de
// documentRequestTargetOptions.ts (celui-là est importé par un composant client -- il doit
// rester libre de tout code serveur/Supabase).
export type ResolvedDocumentRequestTarget = {
  target_kind: DocumentRequestTargetKind;
  client_id: string | null;
  supplier_id: string | null;
};

export async function resolveDocumentRequestTarget(
  supabase: SupabaseClient,
  args: { grantProjectId: string; dossierClientId: string; targetRaw: string }
): Promise<ResolvedDocumentRequestTarget | { error: string }> {
  const parsed = parseDocumentRequestTargetOptionKey(args.targetRaw);
  if (!parsed) return { error: "Attribution invalide." };
  const { targetKind, value } = parsed;

  if (targetKind === "client") {
    if (value !== args.dossierClientId) return { error: "Attribution invalide." };
    return { target_kind: "client", client_id: value, supplier_id: null };
  }

  if (targetKind === "parent_client") {
    const dossierClient = await clientsService(supabase).get(args.dossierClientId);
    if (!dossierClient?.parent_client_id || dossierClient.parent_client_id !== value) return { error: "Client parent invalide." };
    return { target_kind: "parent_client", client_id: value, supplier_id: null };
  }

  if (targetKind === "child_client") {
    const children = await clientsService(supabase).listChildren(args.dossierClientId);
    if (!children.some((c) => c.id === value)) return { error: "Client enfant invalide." };
    return { target_kind: "child_client", client_id: value, supplier_id: null };
  }

  // supplier -- une demande est TOUJOURS visible dans le portail (pas d'opt-in comme pour les
  // tâches internes) : un fournisseur sans compte portail (supplier_client_id) est donc refusé
  // ici, pas seulement grisé côté UI -- lui attribuer une demande la rendrait invisible pour tout
  // le monde côté externe.
  const suppliers = await projectSuppliersService(supabase).listByProject(args.grantProjectId);
  const supplier = suppliers.find((s) => s.id === value);
  if (!supplier) return { error: "Fournisseur invalide pour ce dossier." };
  if (!supplier.supplier_client_id) return { error: "Ce fournisseur n'a pas de compte portail -- la demande ne pourrait jamais lui être montrée." };
  return { target_kind: "supplier", client_id: null, supplier_id: supplier.id };
}
