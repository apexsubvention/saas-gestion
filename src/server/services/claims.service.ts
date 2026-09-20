import type { SupabaseClient } from "@supabase/supabase-js";
import { claimsRepository } from "@/server/repositories/claims.repository";
import { CLAIM_STATUS_LABELS } from "@/features/grants/constants";

export function claimsService(supabase: SupabaseClient) {
  const repo = claimsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async create(
      organizationId: string,
      grantProjectId: string,
      input: {
        claim_number?: string | null;
        period_start?: string | null;
        period_end?: string | null;
        due_date?: string | null;
        status?: string;
        progress_report?: string | null;
      }
    ) {
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...input });
    },
    async updateStatus(id: string, status: string) {
      if (!(status in CLAIM_STATUS_LABELS)) {
        throw new Error(`Statut de réclamation invalide : ${status}`);
      }
      return repo.updateStatus(id, status);
    },
  };
}
