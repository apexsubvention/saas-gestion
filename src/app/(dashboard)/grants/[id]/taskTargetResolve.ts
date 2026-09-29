import type { SupabaseClient } from "@supabase/supabase-js";
import { clientsService } from "@/server/services/clients.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { parseTaskTargetOptionKey, type TaskTargetKind } from "./taskTargetOptions";

// 0069 -- résout et VALIDE côté serveur la clé d'attribution soumise par le formulaire
// (NewTaskForm/TasksManager) en { target_kind, client_id, supplier_id } réels -- jamais faire
// confiance au <select> seul : on revérifie que la cible choisie appartient bien à ce dossier
// (même principe que la vérification de claim_id/assigned_to déjà faite dans actions.ts).
// Fichier séparé de taskTargetOptions.ts (celui-là est importé par NewTaskForm.tsx, un composant
// client -- il doit rester libre de tout code serveur/Supabase).
export type ResolvedTaskTarget = {
  target_kind: TaskTargetKind;
  client_id: string | null;
  supplier_id: string | null;
  // false = pas de compte portail possible pour cette cible (fournisseur non inscrit) --
  // l'appelant doit alors refuser visible_in_portal=true plutôt que l'accepter silencieusement.
  hasPortalAccess: boolean;
};

export async function resolveTaskTarget(
  supabase: SupabaseClient,
  args: { grantProjectId: string; dossierClientId: string; targetRaw: string }
): Promise<ResolvedTaskTarget | { error: string }> {
  const parsed = parseTaskTargetOptionKey(args.targetRaw);
  if (!parsed) return { error: "Attribution invalide." };
  const { targetKind, value } = parsed;

  if (targetKind === "client") {
    if (value !== args.dossierClientId) return { error: "Attribution invalide." };
    return { target_kind: "client", client_id: value, supplier_id: null, hasPortalAccess: true };
  }

  if (targetKind === "parent_client") {
    const dossierClient = await clientsService(supabase).get(args.dossierClientId);
    if (!dossierClient?.parent_client_id || dossierClient.parent_client_id !== value) return { error: "Client parent invalide." };
    return { target_kind: "parent_client", client_id: value, supplier_id: null, hasPortalAccess: true };
  }

  if (targetKind === "child_client") {
    const children = await clientsService(supabase).listChildren(args.dossierClientId);
    if (!children.some((c) => c.id === value)) return { error: "Client enfant invalide." };
    return { target_kind: "child_client", client_id: value, supplier_id: null, hasPortalAccess: true };
  }

  // supplier
  const suppliers = await projectSuppliersService(supabase).listByProject(args.grantProjectId);
  const supplier = suppliers.find((s) => s.id === value);
  if (!supplier) return { error: "Fournisseur invalide pour ce dossier." };
  return { target_kind: "supplier", client_id: null, supplier_id: supplier.id, hasPortalAccess: Boolean(supplier.supplier_client_id) };
}
