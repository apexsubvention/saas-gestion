import type { SupabaseClient } from "@supabase/supabase-js";
import { documentRequestsRepository } from "@/server/repositories/documentRequests.repository";

export const DOCUMENT_REQUEST_STATUSES = ["not_requested", "requested", "received", "validated", "issue", "not_required"];

export function documentRequestsService(supabase: SupabaseClient) {
  const repo = documentRequestsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    findById: (id: string) => repo.findById(id),

    // Crée une demande directement au statut "requested" (envoyée au client) : le
    // formulaire qui appelle ceci sert justement à demander quelque chose MAINTENANT,
    // pas à noter un besoin futur -- "not_requested" reste possible en base mais n'est
    // jamais posé par ce chemin.
    async create(
      organizationId: string,
      clientId: string,
      input: {
        grant_project_id?: string | null;
        claim_id?: string | null;
        document_type: string;
        title: string;
        instructions?: string | null;
        due_date?: string | null;
      }
    ) {
      const title = input.title.trim();
      if (!title) throw new Error("Le titre du document demandé est requis.");
      if (title.length > 200) throw new Error("Titre trop long (200 caractères maximum).");
      return repo.create({
        organization_id: organizationId,
        client_id: clientId,
        grant_project_id: input.grant_project_id ?? null,
        claim_id: input.claim_id ?? null,
        document_type: input.document_type.trim() || "other",
        title,
        instructions: input.instructions?.trim() || null,
        due_date: input.due_date || null,
        status: "requested",
        visible_in_client_portal: true,
        requested_at: new Date().toISOString(),
      });
    },

    async updateStatus(id: string, status: string) {
      if (!DOCUMENT_REQUEST_STATUSES.includes(status)) {
        throw new Error(`Statut de demande invalide : ${status}`);
      }
      const extra: { received_at?: string | null; validated_at?: string | null } = {};
      if (status === "validated") extra.validated_at = new Date().toISOString();
      return repo.updateStatus(id, status, extra);
    },

    remove: (id: string) => repo.remove(id),
  };
}
