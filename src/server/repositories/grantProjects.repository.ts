import type { SupabaseClient } from "@supabase/supabase-js";

export type GrantProjectRow = {
  id: string;
  organization_id: string;
  client_id: string;
  program_id: string;
  name: string;
  status: string;
  official_start_date: string | null;
  official_end_date: string | null;
  internal_target_end_date: string | null;
  total_project_cost: number | null;
  approved_grant_amount: number | null;
  grant_rate: number | null;
  health_score: number | null;
  created_at: string;
  // Jade : masquer un dossier d'un client ENFANT du portail de son client PARENT (ex. le
  // dossier ne concerne pas le parent) -- sans le masquer du portail du client lui-même, ni
  // du personnel. Filtré côté application dans portalDossiersService.listDossiers(), pas par
  // RLS -- voir 0056 pour le raisonnement complet.
  hidden_from_parent_portal: boolean;
};

export function grantProjectsRepository(supabase: SupabaseClient) {
  return {
    async list() {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, clients(name, parent_client_id), grant_programs(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },

    async listByClient(clientId: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, grant_programs(name)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },

    async findById(id: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, clients(name, parent_client_id), grant_programs(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async findExisting(clientId: string, programId: string, name: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*")
        .eq("client_id", clientId)
        .eq("program_id", programId)
        .ilike("name", name.trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as GrantProjectRow | null;
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      program_id: string;
      name: string;
      owner_id?: string | null;
      status?: string;
      description?: string | null;
      total_project_cost?: number | null;
      approved_grant_amount?: number | null;
      grant_rate?: number | null;
      official_start_date?: string | null;
      official_end_date?: string | null;
    }): Promise<GrantProjectRow> {
      const { data, error } = await supabase.from("grant_projects").insert(input).select().single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    async updateStatus(id: string, status: string): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    async updateHiddenFromParentPortal(id: string, hidden: boolean): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ hidden_from_parent_portal: hidden, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },
  };
}
