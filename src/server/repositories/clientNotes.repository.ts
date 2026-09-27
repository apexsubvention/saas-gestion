import type { SupabaseClient } from "@supabase/supabase-js";

// Fil de notes partagées entre le personnel et le portail client, par CLIENT plutôt que par
// dossier (0062, Jade) -- pour les petites choses discutées (en rencontre ou autrement) qui
// n'ont pas forcément de rapport avec un dossier précis. Même design que dossier_notes/
// dossierNotes.repository.ts (voir ses commentaires) : pas de mise à jour, author_role/
// author_name dénormalisés à l'écriture.

export type ClientNoteRow = {
  id: string;
  client_id: string;
  author_org_user_id: string;
  author_role: "staff" | "client";
  author_name: string;
  body: string;
  visible_to_client: boolean;
  created_at: string;
};

const COLUMNS = "id, client_id, author_org_user_id, author_role, author_name, body, visible_to_client, created_at";

export function clientNotesRepository(supabase: SupabaseClient) {
  return {
    async listByClient(clientId: string): Promise<ClientNoteRow[]> {
      const { data, error } = await supabase
        .from("client_notes")
        .select(COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as ClientNoteRow[];
    },

    // Plusieurs clients à la fois (0062) : le portail affiche un fil par client (le sien +
    // chacun de ses clients enfants) -- une seule requête plutôt qu'une par client.
    async listByClients(clientIds: string[]): Promise<ClientNoteRow[]> {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("client_notes")
        .select(COLUMNS)
        .in("client_id", clientIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as ClientNoteRow[];
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      author_org_user_id: string;
      author_role: "staff" | "client";
      author_name: string;
      body: string;
      visible_to_client: boolean;
    }): Promise<ClientNoteRow> {
      const { data, error } = await supabase.from("client_notes").insert(input).select(COLUMNS).single();
      if (error) throw error;
      return data as unknown as ClientNoteRow;
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
