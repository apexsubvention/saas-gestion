import type { SupabaseClient } from "@supabase/supabase-js";

// Objectifs initiaux d'un projet (saisis une fois par dossier) -- voir 0041_ddr_pari_cnrc.sql.
// Repris tels quels dans chaque DDR (« OBJECTIF 1, 2, 3... ») avec un % d'avancement qui évolue.

export type GrantProjectObjectiveRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  position: number;
  label: string;
  created_at: string;
};

export function grantProjectObjectivesRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<GrantProjectObjectiveRow[]> {
      const { data, error } = await supabase
        .from("grant_project_objectives")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as GrantProjectObjectiveRow[];
    },

    // Remplace toute la liste d'un coup (plus simple pour un champ « colle tes objectifs, un par
    // ligne » que du CRUD ligne par ligne) : supprime les anciennes, insère les nouvelles dans l'ordre.
    async replaceAll(organizationId: string, grantProjectId: string, labels: string[]): Promise<GrantProjectObjectiveRow[]> {
      const { error: delError } = await supabase.from("grant_project_objectives").delete().eq("grant_project_id", grantProjectId);
      if (delError) throw delError;
      if (labels.length === 0) return [];
      const rows = labels.map((label, position) => ({ organization_id: organizationId, grant_project_id: grantProjectId, position, label }));
      const { data, error } = await supabase.from("grant_project_objectives").insert(rows).select();
      if (error) throw error;
      return data as GrantProjectObjectiveRow[];
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("grant_project_objectives").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
