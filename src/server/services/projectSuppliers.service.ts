import type { SupabaseClient } from "@supabase/supabase-js";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";

export function projectSuppliersService(supabase: SupabaseClient) {
  const repo = projectSuppliersRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    listBySupplierClient: (supplierClientId: string) => repo.listBySupplierClient(supplierClientId),
    getSupplierDossierView: (grantProjectId: string) => repo.getSupplierDossierView(grantProjectId),
    async create(
      organizationId: string,
      grantProjectId: string,
      input: {
        name: string;
        contact?: string | null;
        budget_amount?: number | null;
        billing_frequency?: string | null;
        expected_invoice_day?: number | null;
        invoice_description_requirements?: string | null;
        notes?: string | null;
        supplier_client_id?: string | null;
      }
    ) {
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...input });
    },
  };
}
