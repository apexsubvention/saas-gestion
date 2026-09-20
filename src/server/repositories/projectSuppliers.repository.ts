import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectSupplierRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  name: string;
  contact: string | null;
  budget_amount: number | null;
  billing_frequency: string | null;
  expected_invoice_day: number | null;
  invoice_description_requirements: string | null;
  notes: string | null;
  supplier_client_id: string | null;
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

    // Utilisé par le portail : toutes les lignes fournisseur où CE client Apex est lui-même
    // le fournisseur (ex. Sitegrow facture pour ses propres clients finaux). RLS
    // (project_suppliers_select -> can_access_grant_project -> can_access_client, voir
    // 0028) filtre déjà aux dossiers réellement accessibles à l'appelant.
    async listBySupplierClient(supplierClientId: string) {
      const { data, error } = await supabase
        .from("project_suppliers")
        .select("*, grant_projects(name, client_id, clients(name))")
        .eq("supplier_client_id", supplierClientId);
      if (error) throw error;
      return data;
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      name: string;
      contact?: string | null;
      budget_amount?: number | null;
      billing_frequency?: string | null;
      expected_invoice_day?: number | null;
      invoice_description_requirements?: string | null;
      notes?: string | null;
      supplier_client_id?: string | null;
    }): Promise<ProjectSupplierRow> {
      const { data, error } = await supabase.from("project_suppliers").insert(input).select().single();
      if (error) throw error;
      return data as ProjectSupplierRow;
    },
  };
}
