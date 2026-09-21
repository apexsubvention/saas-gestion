import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpenseRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  eligible_amount: number | null;
  status: string;
  source: "manual" | "ai";
};

export function expensesRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ExpenseRow[]> {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data as ExpenseRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      supplier_id?: string | null;
      invoice_number?: string | null;
      invoice_date?: string | null;
      subtotal?: number | null;
      tax?: number | null;
      total?: number | null;
      eligible_amount?: number | null;
      status?: string;
      source?: "manual" | "ai";
    }): Promise<ExpenseRow> {
      const { data, error } = await supabase.from("expenses").insert(input).select().single();
      if (error) throw error;
      return data as ExpenseRow;
    },

    async update(
      id: string,
      patch: Partial<Pick<ExpenseRow, "supplier_id" | "invoice_number" | "invoice_date" | "subtotal" | "tax" | "total" | "eligible_amount" | "status">>
    ): Promise<ExpenseRow> {
      const { data, error } = await supabase.from("expenses").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as ExpenseRow;
    },

    // Nombre de lignes supprimées : 0 = refusé par la RLS (ou déjà supprimé).
    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
