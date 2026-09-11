import type { SupabaseClient } from "@supabase/supabase-js";
import { documentsRepository } from "@/server/repositories/documents.repository";

const BUCKET = "apex-documents";

export function documentsService(supabase: SupabaseClient) {
  const repo = documentsRepository(supabase);

  return {
    listByClient: (clientId: string) => repo.listByClient(clientId),

    // Upload + insertion en une transaction applicative : le fichier va dans le storage
    // AVANT la ligne "documents" (si l'insert echoue -- ex. RLS -- le fichier orphelin
    // est un moindre mal qu'une ligne "documents" pointant vers rien).
    async upload(params: {
      organizationId: string;
      clientId: string;
      uploadedBy: string;
      category: string;
      file: File;
    }) {
      const path = `${params.organizationId}/${params.clientId}/${Date.now()}-${params.file.name}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file, {
        contentType: params.file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      return repo.create({
        organization_id: params.organizationId,
        filename: params.file.name,
        storage_path: path,
        mime_type: params.file.type || null,
        size: params.file.size || null,
        category: params.category,
        client_id: params.clientId,
        uploaded_by: params.uploadedBy,
      });
    },

    // URL signee de courte duree -- jamais d'acces public direct au bucket.
    async getSignedUrl(storagePath: string, expiresInSeconds = 300) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
