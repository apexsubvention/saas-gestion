import type { SupabaseClient } from "@supabase/supabase-js";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";

export function grantAgreementsService(supabase: SupabaseClient) {
  const repo = grantAgreementsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async create(
      organizationId: string,
      grantProjectId: string,
      input: {
        project_start?: string | null;
        project_end?: string | null;
        eligible_expense_period_start?: string | null;
        eligible_expense_period_end?: string | null;
        grant_amount?: number | null;
        grant_rate?: number | null;
        special_conditions?: string | null;
      }
    ) {
      return repo.create({
        organization_id: organizationId,
        grant_project_id: grantProjectId,
        ...input,
      });
    },
  };
}
