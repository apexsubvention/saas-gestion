import type { SupabaseClient } from "@supabase/supabase-js";

export type GrantAgreementRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  project_start: string | null;
  project_end: string | null;
  eligible_expense_period_start: string | null;
  eligible_expense_period_end: string | null;
  grant_amount: number | null;
  grant_rate: number | null;
  claim_frequency: string | null;
  special_conditions: string | null;
  created_at: string;
};

export type GrantAgreementWrite = {
  project_start?: string | null;
  project_end?: string | null;
  eligible_expense_period_start?: string | null;
  eligible_expense_period_end?: string | null;
  grant_amount?: number | null;
  grant_rate?: number | null;
  claim_frequency?: string | null;
  special_conditions?: string | null;
};

export function grantAgreementsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<GrantAgreementRow[]> {
      const { data, error } = await supabase
        .from("grant_agreements")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GrantAgreementRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      project_start?: string | null;
      project_end?: string | null;
      eligible_expense_period_start?: string | null;
      eligible_expense_period_end?: string | null;
      grant_amount?: number | null;
      grant_rate?: number | null;
      claim_frequency?: string | null;
      special_conditions?: string | null;
    }): Promise<GrantAgreementRow> {
      const { data, error } = await supabase.from("grant_agreements").insert(input).select().single();
      if (error) throw error;
      return data as GrantAgreementRow;
    },

    async update(id: string, patch: GrantAgreementWrite): Promise<GrantAgreementRow> {
      const { data, error } = await supabase.from("grant_agreements").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as GrantAgreementRow;
    },
  };
}
