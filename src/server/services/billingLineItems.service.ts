import type { SupabaseClient } from "@supabase/supabase-js";
import { billingLineItemsRepository, type BillingLineItemInput } from "@/server/repositories/billingLineItems.repository";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";

function clampAmount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, 1_000_000_000) * 100) / 100;
}

const EXCLUSION_REASONS = new Set(["internal_salary", "redistribute_supplier", "new_supplier"]);

export function billingLineItemsService(supabase: SupabaseClient) {
  const repo = billingLineItemsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    async replaceAll(organizationId: string, grantProjectId: string, rawItems: BillingLineItemInput[], source: "ai" | "manual") {
      // Fournisseur associé (0059) : revalidé ici plutôt que de faire confiance au formulaire --
      // seuls les fournisseurs DE CE dossier, visibles par l'appelant (client RLS), sont acceptés ;
      // un id qui n'y figure pas (fournisseur d'un autre dossier, faute de frappe) est ignoré (null)
      // plutôt que de planter sur la contrainte de clé étrangère.
      const validSupplierIds = new Set((await projectSuppliersRepository(supabase).listByProject(grantProjectId)).map((s) => s.id));
      const items = rawItems
        .map((it) => {
          const included = it.included_in_billing ?? true;
          // La raison n'a de sens que décoché -- jamais gardée si le poste redevient "À facturer"
          // (ex. le poste avait été noté « à redistribuer » puis recoché par erreur ou après coup).
          const reason = !included && it.exclusion_reason && EXCLUSION_REASONS.has(it.exclusion_reason) ? it.exclusion_reason : null;
          const supplierId = it.supplier_id && validSupplierIds.has(it.supplier_id) ? it.supplier_id : null;
          return {
            label: it.label.trim().slice(0, 300),
            description: it.description && it.description.trim() ? it.description.trim().slice(0, 2000) : null,
            amount: clampAmount(it.amount),
            hours: it.hours != null && Number.isFinite(it.hours) && it.hours >= 0 ? Math.round(Math.min(it.hours, 100_000) * 100) / 100 : null,
            included_in_billing: included,
            exclusion_reason: reason,
            supplier_id: supplierId,
          };
        })
        .filter((it) => it.label.length > 0)
        .slice(0, 40);
      return repo.replaceAll(organizationId, grantProjectId, items, source);
    },
  };
}
