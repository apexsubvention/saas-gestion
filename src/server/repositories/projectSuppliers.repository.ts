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
  position: number; // ordre d'affichage (0036/0038)
  // Traçabilité (0036) : valeur automatique / modification manuelle, jamais détruite
  accepted_subsidy_auto: number | null;
  accepted_subsidy_override: number | null;
  accepted_subsidy_override_by: string | null;
  accepted_subsidy_override_at: string | null;
  claimed_override: number | null;
  claimed_override_by: string | null;
  claimed_override_at: string | null;
  source_kind: "manual" | "ai" | "convention" | "import" | null;
  source_document_id: string | null;
  source_ref: string | null;
  extracted_at: string | null;
  confidence: "high" | "medium" | "low" | null;
};

// Résultat de la fonction RPC portal_supplier_dossier_view (0047) -- une ligne par
// dossier où l'appelant est un fournisseur reconnu (project_suppliers.supplier_client_id).
export type SupplierDossierView = {
  grant_project_id: string;
  grant_project_name: string;
  status: string;
  client_name: string;
  program_name: string;
  official_start_date: string | null;
  official_end_date: string | null;
  total_project_cost: number | null;
  approved_grant_amount: number | null;
  grant_rate: number | null;
  own_supplier_id: string | null;
  own_budget_amount: number | null;
  own_billing_frequency: string | null;
  own_expected_invoice_day: number | null;
  own_invoice_description_requirements: string | null;
  other_suppliers_count: number;
  other_suppliers_total: number;
};

export function projectSuppliersRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ProjectSupplierRow[]> {
      const { data, error } = await supabase
        .from("project_suppliers")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as ProjectSupplierRow[];
    },

    // Utilisé par le portail : toutes les lignes fournisseur où CE client Apex est lui-même
    // le fournisseur (ex. Sitegrow facture pour ses propres clients finaux). RLS via
    // project_suppliers_select_own_supplier_row (0047) : sa PROPRE ligne, sur n'importe
    // quel dossier -- avant 0047, project_suppliers_select exigeait can_access_grant_project
    // (hiérarchie/client_access sur le CLIENT FINAL), donc cette requête ne retournait rien
    // pour le cas d'usage même qu'elle visait (fournisseur sans lien de hiérarchie).
    async listBySupplierClient(supplierClientId: string) {
      const { data, error } = await supabase
        .from("project_suppliers")
        .select("*, grant_projects(name, client_id, clients(name), grant_programs(name))")
        .eq("supplier_client_id", supplierClientId);
      if (error) throw error;
      return data;
    },

    // Vue détaillée d'un dossier pour un compte fournisseur (0047) : budget total, portion
    // subvention, sa propre ligne de facturation, et un total AGRÉGÉ des autres
    // fournisseurs (jamais leur identité/détail -- décision Jade). Passe par une fonction
    // RPC security definer plutôt que d'ouvrir des policies SELECT larges sur
    // grant_projects/clients/grant_programs -- voir 0047_portal_supplier_dossier_access.sql.
    async getSupplierDossierView(grantProjectId: string): Promise<SupplierDossierView | null> {
      const { data, error } = await supabase.rpc("portal_supplier_dossier_view", { p_grant_project_id: grantProjectId });
      if (error) throw error;
      const rows = data as SupplierDossierView[] | null;
      return rows?.[0] ?? null;
    },

    async update(id: string, patch: Partial<Omit<ProjectSupplierRow, "id" | "organization_id" | "grant_project_id">>): Promise<ProjectSupplierRow> {
      const { data, error } = await supabase.from("project_suppliers").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as ProjectSupplierRow;
    },

    // Renvoie le nombre de lignes supprimées : 0 = refusé par la RLS (ou déjà supprimé).
    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("project_suppliers").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
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
      accepted_subsidy_auto?: number | null;
      source_kind?: ProjectSupplierRow["source_kind"];
      source_document_id?: string | null;
      source_ref?: string | null;
      extracted_at?: string | null;
      confidence?: ProjectSupplierRow["confidence"];
    }): Promise<ProjectSupplierRow> {
      const { data, error } = await supabase.from("project_suppliers").insert(input).select().single();
      if (error) throw error;
      return data as ProjectSupplierRow;
    },
  };
}
