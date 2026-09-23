import type { SupabaseClient } from "@supabase/supabase-js";

// Fil de notes partagées entre le personnel et le portail client, par dossier -- voir
// 0046_dossier_notes.sql pour la RLS (écriture directe des deux côtés, sans client admin :
// chacun n'écrit que sa propre ligne). Pas de mise à jour -- un message se supprime et se
// retape, jamais ne se réécrit (même principe que dossier_events).
//
// author_role/author_name sont dénormalisés à l'écriture, PAS lus par jointure sur
// organization_users : sa policy de lecture (is_org_staff OR user_id = auth.uid(), 0033)
// empêcherait un compte portail de voir le nom d'un membre du personnel (ou d'un autre
// compte portail) -- voir le commentaire en tête de la migration.

export type DossierNoteRow = {
  id: string;
  grant_project_id: string;
  client_id: string;
  author_org_user_id: string;
  author_role: "staff" | "client";
  author_name: string;
  body: string;
  visible_to_client: boolean;
  created_at: string;
};

const COLUMNS = "id, grant_project_id, client_id, author_org_user_id, author_role, author_name, body, visible_to_client, created_at";

export function dossierNotesRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<DossierNoteRow[]> {
      const { data, error } = await supabase
        .from("dossier_notes")
        .select(COLUMNS)
        .eq("grant_project_id", grantProjectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as DossierNoteRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      client_id: string;
      author_org_user_id: string;
      author_role: "staff" | "client";
      author_name: string;
      body: string;
      visible_to_client: boolean;
    }): Promise<DossierNoteRow> {
      const { data, error } = await supabase.from("dossier_notes").insert(input).select(COLUMNS).single();
      if (error) throw error;
      return data as unknown as DossierNoteRow;
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from("dossier_notes").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
