import type { SupabaseClient } from "@supabase/supabase-js";

// Versements de l'aide à la facturation d'un dossier -- voir 0042_billing_aid.sql.

export type BillingInstallmentRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  installment_number: number;
  period_start: string;
  period_end: string;
  invoice_description: string | null;
  amount: number;
  status: "draft" | "submitted";
  generated_by: "ai" | "manual";
  created_at: string;
  updated_at: string;
};

export type BillingInstallmentInsert = {
  organization_id: string;
  grant_project_id: string;
  installment_number: number;
  period_start: string;
  period_end: string;
  invoice_description?: string | null;
  amount: number;
  generated_by?: "ai" | "manual";
};

export type BillingInstallmentUpdate = Partial<Pick<BillingInstallmentRow, "invoice_description" | "amount" | "status">>;

export function billingInstallmentsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<BillingInstallmentRow[]> {
      const { data, error } = await supabase
        .from("billing_installments")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("installment_number", { ascending: true });
      if (error) throw error;
      return data as unknown as BillingInstallmentRow[];
    },

    async insertMany(rows: BillingInstallmentInsert[]): Promise<BillingInstallmentRow[]> {
      if (rows.length === 0) return [];
      const { data, error } = await supabase.from("billing_installments").insert(rows).select();
      if (error) throw error;
      return data as unknown as BillingInstallmentRow[];
    },

    async update(id: string, patch: BillingInstallmentUpdate): Promise<BillingInstallmentRow> {
      const { data, error } = await supabase.from("billing_installments").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as BillingInstallmentRow;
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("billing_installments").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    // Supprime tous les versements encore « draft » d'un projet (utilisé pour régénérer les
    // versements restants avec un nouveau compte -- les versements « submitted » (déjà facturés)
    // sont toujours préservés).
    async removeAllDrafts(grantProjectId: string): Promise<number> {
      const { data, error } = await supabase.from("billing_installments").delete().eq("grant_project_id", grantProjectId).eq("status", "draft").select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
