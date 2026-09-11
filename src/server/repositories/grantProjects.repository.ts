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
};

export function grantProjectsRepository(supabase: SupabaseClient) {
  return {
    async list() {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, clients(name), grant_programs(name)")
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
        .select("*, clients(name), grant_programs(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      program_id: string;
      name: string;
      owner_id?: string | null;
      total_project_cost?: number | null;
      approved_grant_amount?: number | null;
      official_start_date?: string | null;
      official_end_date?: string | null;
    }): Promise<GrantProjectRow> {
      const { data, error } = await supabase.from("grant_projects").insert(input).select().single();
      if (error) throw error;
      return data as GrantProjectRow;
    },
  };
}
