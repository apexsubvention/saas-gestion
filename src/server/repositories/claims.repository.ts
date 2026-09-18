import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  claim_number: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
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
      status?: string;
      progress_report?: string | null;
    }): Promise<ClaimRow> {
      const { data, error } = await supabase.from("claims").insert(input).select().single();
      if (error) throw error;
      return data as ClaimRow;
    },
  };
}
