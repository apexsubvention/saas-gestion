import type { SupabaseClient } from "@supabase/supabase-js";
import { expensesRepository } from "@/server/repositories/expenses.repository";

export function expensesService(supabase: SupabaseClient) {
  const repo = expensesRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async create(
      organizationId: string,
      grantProjectId: string,
      input: {
        supplier_id?: string | null;
        invoice_number?: string | null;
        invoice_date?: string | null;
        total?: number | null;
        eligible_amount?: number | null;
        status?: string;
      }
    ) {
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...input });
    },
  };
}
