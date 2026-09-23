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
  created_at: string;
  updated_at: string;
};

export type BillingLineItemInput = {
  label: string;
  description: string | null;
  amount: number;
  hours: number | null;
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
