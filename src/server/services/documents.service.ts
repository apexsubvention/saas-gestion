import type { SupabaseClient } from "@supabase/supabase-js";
import { documentsRepository } from "@/server/repositories/documents.repository";

const BUCKET = "apex-documents";

export function documentsService(supabase: SupabaseClient) {
  const repo = documentsRepository(supabase);

  return {
    listByClient: (clientId: string) => repo.listByClient(clientId),
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    // Upload + insertion en une transaction applicative : le fichier va dans le storage
    // AVANT la ligne "documents" (si l'insert echoue -- ex. RLS -- le fichier orphelin
    // est un moindre mal qu'une ligne "documents" pointant vers rien).
    // grantProjectId est optionnel : un document peut être rattaché au client seulement
    // (fiche client) ou au client ET à un projet de subvention précis (fiche dossier).
    // linkToClaimId est optionnel : quand fourni, crée en plus un document_links vers
    // cette réclamation précise (ex. "cette facture appuie la réclamation 1"), en plus
    // du rattachement général client/projet.
    async upload(params: {
      organizationId: string;
      clientId: string;
      grantProjectId?: string | null;
      uploadedBy: string;
      category: string;
      file: File;
      linkToClaimId?: string | null;
    }) {
      const path = `${params.organizationId}/${params.clientId}/${Date.now()}-${params.file.name}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file, {
        contentType: params.file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const doc = await repo.create({
        organization_id: params.organizationId,
        filename: params.file.name,
        storage_path: path,
        mime_type: params.file.type || null,
        size: params.file.size || null,
        category: params.category,
        client_id: params.clientId,
        grant_project_id: params.grantProjectId ?? null,
        uploaded_by: params.uploadedBy,
      });

      if (params.linkToClaimId) {
        await repo.linkToEntity({
          organization_id: params.organizationId,
          document_id: doc.id,
          entity_type: "claim",
          entity_id: params.linkToClaimId,
        });
      }

      return doc;
    },

    // URL signee de courte duree -- jamais d'acces public direct au bucket.
    async getSignedUrl(storagePath: string, expiresInSeconds = 300) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
