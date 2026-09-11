import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentRow = {
  id: string;
  organization_id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size: number | null;
  category: string;
  client_id: string | null;
  grant_project_id: string | null;
  created_at: string;
};

export function documentsRepository(supabase: SupabaseClient) {
  return {
    async listByClient(clientId: string): Promise<DocumentRow[]> {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DocumentRow[];
    },

    async create(input: {
      organization_id: string;
      filename: string;
      storage_path: string;
      mime_type: string | null;
      size: number | null;
      category: string;
      client_id: string;
      uploaded_by: string;
    }): Promise<DocumentRow> {
      const { data, error } = await supabase
        .from("documents")
        .insert({ ...input, source: "manual" })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentRow;
    },
  };
}

export function documentsListAll(supabase: SupabaseClient) {
  return async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*, clients(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  };
}
