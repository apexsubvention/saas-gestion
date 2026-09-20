import type { SupabaseClient } from "@supabase/supabase-js";
import { claimRequirementsRepository } from "@/server/repositories/claimRequirements.repository";

const REQUIREMENT_STATUSES = ["missing", "requested", "received", "validated", "not_required", "issue"];

export function claimRequirementsService(supabase: SupabaseClient) {
  const repo = claimRequirementsRepository(supabase);
  return {
    listByClaim: (claimId: string) => repo.listByClaim(claimId),
    countOpenByClaimIds: (claimIds: string[]) => repo.countOpenByClaimIds(claimIds),

    async create(organizationId: string, claimId: string, label: string) {
      const trimmed = label.trim();
      if (!trimmed) {
        throw new Error("Le libellé de l'élément requis est obligatoire.");
      }
      return repo.create({ organization_id: organizationId, claim_id: claimId, label: trimmed });
    },

    async updateStatus(id: string, status: string) {
      if (!REQUIREMENT_STATUSES.includes(status)) {
        throw new Error(`Statut d'élément requis invalide : ${status}`);
      }
      return repo.updateStatus(id, status);
    },
  };
}
