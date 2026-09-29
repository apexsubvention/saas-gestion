import type { SupabaseClient } from "@supabase/supabase-js";
import { documentRequestsRepository, type DocumentRequestTargetKind } from "@/server/repositories/documentRequests.repository";

export const DOCUMENT_REQUEST_STATUSES = ["not_requested", "requested", "received", "validated", "issue", "not_required"];
const DOCUMENT_REQUEST_TARGET_KINDS: DocumentRequestTargetKind[] = ["client", "parent_client", "child_client", "supplier"];

export function documentRequestsService(supabase: SupabaseClient) {
  const repo = documentRequestsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    findById: (id: string) => repo.findById(id),

    // Crée une demande directement au statut "requested" (envoyée au client) : le
    // formulaire qui appelle ceci sert justement à demander quelque chose MAINTENANT,
    // pas à noter un besoin futur -- "not_requested" reste possible en base mais n'est
    // jamais posé par ce chemin.
    //
    // 0070 -- Jade : attribuer la demande au client du dossier (par défaut, comme avant), à son
    // client parent, à un de ses clients enfants, ou à un fournisseur inscrit -- target_kind/
    // client_id/supplier_id déjà résolus et validés par documentRequestTargetResolve.ts avant
    // d'arriver ici (jamais fait confiance au formulaire seul).
    async create(
      organizationId: string,
      input: {
        client_id: string | null;
        target_kind?: DocumentRequestTargetKind;
        supplier_id?: string | null;
        grant_project_id?: string | null;
        claim_id?: string | null;
        document_type: string;
        title: string;
        instructions?: string | null;
        due_date?: string | null;
        requires_upload?: boolean;
      }
    ) {
      const title = input.title.trim();
      if (!title) throw new Error("Le titre du document demandé est requis.");
      if (title.length > 200) throw new Error("Titre trop long (200 caractères maximum).");
      const targetKind: DocumentRequestTargetKind = input.target_kind ?? "client";
      if (!DOCUMENT_REQUEST_TARGET_KINDS.includes(targetKind)) {
        throw new Error("Attribution invalide.");
      }
      if (targetKind === "supplier" && !input.supplier_id) {
        throw new Error("Choisis le fournisseur à qui attribuer cette demande.");
      }
      if (targetKind !== "supplier" && !input.client_id) {
        throw new Error("Choisis le client à qui attribuer cette demande.");
      }
      return repo.create({
        organization_id: organizationId,
        client_id: input.client_id,
        target_kind: targetKind,
        supplier_id: input.supplier_id ?? null,
        grant_project_id: input.grant_project_id ?? null,
        claim_id: input.claim_id ?? null,
        document_type: input.document_type.trim() || "other",
        title,
        instructions: input.instructions?.trim() || null,
        due_date: input.due_date || null,
        status: "requested",
        visible_in_client_portal: true,
        // 0067 -- défaut true (téléversement requis) si non précisé : comportement inchangé.
        requires_upload: input.requires_upload ?? true,
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
