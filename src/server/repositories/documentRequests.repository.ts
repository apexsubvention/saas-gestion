import type { SupabaseClient } from "@supabase/supabase-js";

// document_requests existait déjà (0009_document_requests_links.sql) -- pensée dès le
// départ pour ça (colonne visible_in_client_portal, statuts requested/received/...) mais
// jamais reliée à une UI jusqu'ici. RLS (document_requests_select = can_access_client,
// voir 0016) déjà portail-compatible sans changement : aucune migration nécessaire pour
// cette fonctionnalité.

export type DocumentRequestRow = {
  id: string;
  organization_id: string;
  client_id: string;
  grant_project_id: string | null;
  claim_id: string | null;
  document_type: string;
  title: string;
  instructions: string | null;
  due_date: string | null;
  status: string;
  visible_in_client_portal: boolean;
  requested_at: string | null;
  received_at: string | null;
  validated_at: string | null;
  created_at: string;
};

export function documentRequestsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<DocumentRequestRow[]> {
      const { data, error } = await supabase
        .from("document_requests")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DocumentRequestRow[];
    },

    async findById(id: string): Promise<DocumentRequestRow | null> {
      const { data, error } = await supabase.from("document_requests").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as DocumentRequestRow | null;
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      grant_project_id?: string | null;
      claim_id?: string | null;
      document_type: string;
      title: string;
      instructions?: string | null;
      due_date?: string | null;
      status?: string;
      visible_in_client_portal?: boolean;
      requested_at?: string | null;
    }): Promise<DocumentRequestRow> {
      const { data, error } = await supabase.from("document_requests").insert(input).select().single();
      if (error) throw error;
      return data as DocumentRequestRow;
    },

    async updateStatus(
      id: string,
      status: string,
      extra?: { received_at?: string | null; validated_at?: string | null }
    ): Promise<DocumentRequestRow> {
      const { data, error } = await supabase
        .from("document_requests")
        .update({ status, updated_at: new Date().toISOString(), ...extra })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as DocumentRequestRow;
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("document_requests").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
