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

    async listByProject(grantProjectId: string): Promise<DocumentRow[]> {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("grant_project_id", grantProjectId)
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
      grant_project_id?: string | null;
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

    // Lien fonctionnel entre un document et une autre entité (ex. une réclamation
    // précise) -- voir document_links dans 0009_document_requests_links.sql. La ligne
    // "documents" porte déjà le lien vers le client/projet ; document_links sert aux
    // liens plus fins (ce document EST la pièce jointe de CETTE réclamation, CETTE
    // facture, etc). organization_id est auto-dérivé par un trigger, pas besoin de le
    // passer ici.
    async linkToEntity(input: {
      document_id: string;
      entity_type: "expense_invoice" | "expense_payment_proof" | "document_request" | "claim_requirement" | "claim" | "grant_agreement" | "application_answer";
      entity_id: string;
      relation_type?: string | null;
    }): Promise<void> {
      const { error } = await supabase.from("document_links").insert(input);
      if (error) throw error;
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
