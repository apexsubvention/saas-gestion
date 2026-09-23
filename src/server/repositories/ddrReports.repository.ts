import type { SupabaseClient } from "@supabase/supabase-js";

// Rapports DDR (PARI CNRC) d'un dossier -- voir 0041_ddr_pari_cnrc.sql.

export type DdrObjectiveSnapshot = { objective_id: string | null; label: string; progress_percent: number | null; narrative: string };

export type DdrReportRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  ddr_number: number;
  period_start: string;
  period_end: string;
  on_schedule: boolean;
  delay_justification: string | null;
  new_end_date: string | null;
  address_changed: boolean;
  company_name_changed: boolean;
  activities_text: string | null;
  variations_text: string | null;
  objectives_snapshot: DdrObjectiveSnapshot[];
  prepared_by_name: string | null;
  prepared_by_title: string | null;
  signature_date: string | null;
  status: "draft" | "submitted";
  generated_by: "ai" | "manual";
  created_at: string;
  updated_at: string;
};

export type DdrReportInsert = {
  organization_id: string;
  grant_project_id: string;
  ddr_number: number;
  period_start: string;
  period_end: string;
  activities_text?: string | null;
  variations_text?: string | null;
  objectives_snapshot?: DdrObjectiveSnapshot[];
  generated_by?: "ai" | "manual";
};

export type DdrReportUpdate = Partial<
  Pick<
    DdrReportRow,
    | "on_schedule"
    | "delay_justification"
    | "new_end_date"
    | "address_changed"
    | "company_name_changed"
    | "activities_text"
    | "variations_text"
    | "objectives_snapshot"
    | "prepared_by_name"
    | "prepared_by_title"
    | "signature_date"
    | "status"
  >
>;

export function ddrReportsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<DdrReportRow[]> {
      const { data, error } = await supabase
        .from("ddr_reports")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("ddr_number", { ascending: true });
      if (error) throw error;
      return data as DdrReportRow[];
    },

    async insertMany(rows: DdrReportInsert[]): Promise<DdrReportRow[]> {
      if (rows.length === 0) return [];
      const { data, error } = await supabase.from("ddr_reports").insert(rows).select();
      if (error) throw error;
      return data as DdrReportRow[];
    },

    async update(id: string, patch: DdrReportUpdate): Promise<DdrReportRow> {
      const { data, error } = await supabase.from("ddr_reports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as DdrReportRow;
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("ddr_reports").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    // Supprime tous les DDR encore « draft » d'un projet (utilisé pour régénérer les DDR restants
    // avec un nouveau compte -- les DDR « submitted » (déjà déposés) sont toujours préservés).
    async removeAllDrafts(grantProjectId: string): Promise<number> {
      const { data, error } = await supabase.from("ddr_reports").delete().eq("grant_project_id", grantProjectId).eq("status", "draft").select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
