import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  claim_number: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string;
  claimed_amount: number | null;
  approved_amount: number | null;
  progress_report: string | null;
};

export function claimsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ClaimRow[]> {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("period_start", { ascending: true });
      if (error) throw error;
      return data as ClaimRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      claim_number?: string | null;
      period_start?: string | null;
      period_end?: string | null;
      due_date?: string | null;
      status?: string;
      progress_report?: string | null;
    }): Promise<ClaimRow> {
      const { data, error } = await supabase.from("claims").insert(input).select().single();
      if (error) throw error;
      return data as ClaimRow;
    },

    async updateStatus(id: string, status: string): Promise<ClaimRow> {
      const { data, error } = await supabase.from("claims").update({ status }).eq("id", id).select().single();
      if (error) throw error;
      return data as ClaimRow;
    },
  };
}

export function claimsListAll(supabase: SupabaseClient) {
  return async () => {
    const { data, error } = await supabase
      .from("claims")
      .select("*, grant_projects(name, client_id, clients(name))")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data;
  };
}
