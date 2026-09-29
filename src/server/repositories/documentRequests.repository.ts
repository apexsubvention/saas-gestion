import type { SupabaseClient } from "@supabase/supabase-js";

// document_requests existait déjà (0009_document_requests_links.sql) -- pensée dès le
// départ pour ça (colonne visible_in_client_portal, statuts requested/received/...) mais
// jamais reliée à une UI jusqu'ici. RLS (document_requests_select = can_access_client,
// voir 0016) déjà portail-compatible sans changement : aucune migration nécessaire pour
// cette fonctionnalité.

// 0070 -- structurellement identique au DocumentRequestTargetKind de
// documentRequestTargetOptions.ts (route grants/[id], jamais importé ici pour ne pas faire
// dépendre ce fichier serveur partagé d'un dossier de route) -- TypeScript les unifie par
// structure, même principe que TaskTargetKind (tasks.repository.ts).
export type DocumentRequestTargetKind = "client" | "parent_client" | "child_client" | "supplier";

export type DocumentRequestRow = {
  id: string;
  organization_id: string;
  // 0070 -- Jade : une demande peut être attribuée au client du dossier (comportement
  // historique, seul cas avant 0070), à son client parent, à un de ses clients enfants, ou à un
  // fournisseur inscrit sur ce dossier -- client_id est alors null (voir supplier_id).
  client_id: string | null;
  grant_project_id: string | null;
  claim_id: string | null;
  document_type: string;
  title: string;
  instructions: string | null;
  due_date: string | null;
  status: string;
  visible_in_client_portal: boolean;
  // 0067 -- Jade : « Tâches à faire pour le client », ce n'est pas chaque tâche demandée qui doit
  // avoir un document à téléverser. true (défaut, comportement inchangé pour l'existant) = le
  // client doit fournir un fichier ; false = une simple case à cocher suffit côté portail.
  requires_upload: boolean;
  target_kind: DocumentRequestTargetKind;
  supplier_id: string | null;
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
      client_id: string | null;
      grant_project_id?: string | null;
      claim_id?: string | null;
      document_type: string;
      title: string;
      instructions?: string | null;
      due_date?: string | null;
      status?: string;
      visible_in_client_portal?: boolean;
      requires_upload?: boolean;
      target_kind?: DocumentRequestTargetKind;
      supplier_id?: string | null;
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
