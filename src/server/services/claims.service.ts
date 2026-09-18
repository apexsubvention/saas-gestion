import type { SupabaseClient } from "@supabase/supabase-js";
import { claimsRepository } from "@/server/repositories/claims.repository";

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
        status?: string;
        progress_report?: string | null;
      }
    ) {
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...input });
    },
  };
}
