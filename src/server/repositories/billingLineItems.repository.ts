import type { SupabaseClient } from "@supabase/supabase-js";

// Activités/postes budgétaires acceptés d'un dossier (source de vérité pour l'aide à la facturation)
// -- voir 0042_billing_aid.sql.

export type BillingLineItemRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  position: number;
  label: string;
  description: string | null;
  amount: number;
  hours: number | null;
  source: "ai" | "manual";
  // Coché (0050) = ce poste donne lieu à une facture du client, et son montant entre dans le total
  // réparti sur les versements. Décoché = coût interne (ex. salaire déjà payé par l'entreprise),
  // remboursé directement par la subvention -- jamais facturé, donc jamais compté dans le total.
  included_in_billing: boolean;
  created_at: string;
  updated_at: string;
};

export type BillingLineItemInput = {
  label: string;
  description: string | null;
  amount: number;
  hours: number | null;
  // Optionnel : true par défaut (comportement historique -- tout poste accepté était facturé).
  included_in_billing?: boolean;
};

export function billingLineItemsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<BillingLineItemRow[]> {
      const { data, error } = await supabase
        .from("billing_line_items")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as unknown as BillingLineItemRow[];
    },

    // Remplace toute la liste d'un coup (édition en bloc, comme le formulaire de la liste complète) :
    // supprime les anciennes lignes, insère les nouvelles dans l'ordre.
    async replaceAll(organizationId: string, grantProjectId: string, items: BillingLineItemInput[], source: "ai" | "manual"): Promise<BillingLineItemRow[]> {
      const { error: delError } = await supabase.from("billing_line_items").delete().eq("grant_project_id", grantProjectId);
      if (delError) throw delError;
      if (items.length === 0) return [];
      const rows = items.map((item, position) => ({
        organization_id: organizationId,
        grant_project_id: grantProjectId,
        position,
        label: item.label,
        description: item.description,
        amount: item.amount,
        hours: item.hours,
        included_in_billing: item.included_in_billing ?? true,
        source,
      }));
      const { data, error } = await supabase.from("billing_line_items").insert(rows).select();
      if (error) throw error;
      return data as unknown as BillingLineItemRow[];
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("billing_line_items").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
