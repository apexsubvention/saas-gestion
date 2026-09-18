import type { SupabaseClient } from "@supabase/supabase-js";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";

export function projectSuppliersService(supabase: SupabaseClient) {
  const repo = projectSuppliersRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async create(
      organizationId: string,
      grantProjectId: string,
      input: { name: string; contact?: string | null; budget_amount?: number | null }
    ) {
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...input });
    },
  };
}
