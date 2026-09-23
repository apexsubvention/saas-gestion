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
    // Documents rattachés à des factures (document_links.entity_type = 'expense_invoice').
    async listInvoiceLinks(expenseIds: string[]): Promise<Array<{ expense_id: string; document_id: string; filename: string; storage_path: string }>> {
      if (expenseIds.length === 0) return [];
      const { data, error } = await supabase
        .from("document_links")
        .select("entity_id, document_id, documents(filename, storage_path)")
        .eq("entity_type", "expense_invoice")
        .in("entity_id", expenseIds);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        expense_id: row.entity_id,
        document_id: row.document_id,
        filename: row.documents?.filename ?? "",
        storage_path: row.documents?.storage_path ?? "",
      }));
    },

    // Une facture a au plus UN document associé : on remplace le lien existant.
    // organizationId : requis par le type Insert généré (colonne not null sans défaut
    // SQL) même si le trigger enforce_document_link_integrity la réécrit toujours à
    // partir du document -- voir linkToEntity ci-dessous pour la même remarque.
    async setInvoiceDocument(organizationId: string, expenseId: string, documentId: string | null): Promise<void> {
      const { error: delError } = await supabase.from("document_links").delete().eq("entity_type", "expense_invoice").eq("entity_id", expenseId);
      if (delError) throw delError;
      if (!documentId) return;
      const { error } = await supabase
        .from("document_links")
        .insert({ organization_id: organizationId, document_id: documentId, entity_type: "expense_invoice", entity_id: expenseId });
      if (error) throw error;
    },

    // Documents rattachés à des demandes de document (document_links.entity_type =
    // 'document_request') -- même principe que listInvoiceLinks : une seule requête
    // groupée pour tout le dossier plutôt qu'un aller-retour par demande.
    async listDocumentRequestLinks(requestIds: string[]): Promise<Array<{ request_id: string; document_id: string; filename: string; storage_path: string }>> {
      if (requestIds.length === 0) return [];
      const { data, error } = await supabase
        .from("document_links")
        .select("entity_id, document_id, documents(filename, storage_path)")
        .eq("entity_type", "document_request")
        .in("entity_id", requestIds);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        request_id: row.entity_id,
        document_id: row.document_id,
        filename: row.documents?.filename ?? "",
        storage_path: row.documents?.storage_path ?? "",
      }));
    },

    // organization_id : requis par le type Insert généré (colonne not null sans défaut
    // SQL, seulement réécrite par un trigger) -- le trigger enforce_document_link_integrity
    // ignore de toute façon la valeur envoyée et la recalcule depuis document_id, donc ceci
    // ne change aucun comportement, seulement le typage.
    async linkToEntity(input: {
      organization_id: string;
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
