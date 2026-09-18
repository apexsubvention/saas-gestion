import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectSupplierRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  name: string;
  contact: string | null;
  budget_amount: number | null;
};

export function projectSuppliersRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ProjectSupplierRow[]> {
      const { data, error } = await supabase
        .from("project_suppliers")
        .select("*")
        .eq("grant_project_id", grantProjectId);
      if (error) throw error;
      return data as ProjectSupplierRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      name: string;
      contact?: string | null;
      budget_amount?: number | null;
    }): Promise<ProjectSupplierRow> {
      const { data, error } = await supabase.from("project_suppliers").insert(input).select().single();
      if (error) throw error;
      return data as ProjectSupplierRow;
    },
  };
}
