import type { SupabaseClient } from "@supabase/supabase-js";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { DOCUMENT_CATEGORY_LABELS } from "@/features/grants/constants";

// Bibliothèque de documents complète du portail (0045) -- tous les documents des dossiers
// accessibles au compte, quel que soit qui les a déposés (personnel ou client), groupés
// par dossier pour l'affichage. Les documents rattachés au client seulement (pas à un
// dossier précis) forment un groupe "Documents généraux".

export type PortalDocumentItem = {
  id: string;
  filename: string;
  category: string;
  categoryLabel: string;
  source: string;
  createdAt: string;
  storagePath: string;
};

export type PortalDocumentGroup = {
  grantProjectId: string | null;
  grantProjectName: string | null;
  clientName: string | null;
  documents: PortalDocumentItem[];
};

export function portalDocumentsService(supabase: SupabaseClient) {
  const repo = documentsRepository(supabase);

  return {
    async listGrouped(): Promise<PortalDocumentGroup[]> {
      const rows = await repo.listAllAccessible();
      const groups = new Map<string, PortalDocumentGroup>();

      for (const r of rows) {
        const key = r.grant_project_id ?? `client:${r.client_id ?? "?"}`;
        if (!groups.has(key)) {
          groups.set(key, {
            grantProjectId: r.grant_project_id,
            grantProjectName: r.grant_projects?.name ?? null,
            clientName: r.clients?.name ?? null,
            documents: [],
          });
        }
        groups.get(key)!.documents.push({
          id: r.id,
          filename: r.filename,
          category: r.category,
          categoryLabel: DOCUMENT_CATEGORY_LABELS[r.category] ?? r.category,
          source: r.source,
          createdAt: r.created_at,
          storagePath: r.storage_path,
        });
      }

      // Dossiers d'abord (par nom), "Documents généraux" (sans dossier) toujours en dernier.
      return Array.from(groups.values()).sort((a, b) => {
        if (!a.grantProjectId && b.grantProjectId) return 1;
        if (a.grantProjectId && !b.grantProjectId) return -1;
        return (a.grantProjectName ?? "").localeCompare(b.grantProjectName ?? "");
      });
    },
  };
}
