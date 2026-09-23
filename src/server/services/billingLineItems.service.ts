import type { SupabaseClient } from "@supabase/supabase-js";
import { billingLineItemsRepository, type BillingLineItemInput } from "@/server/repositories/billingLineItems.repository";

function clampAmount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, 1_000_000_000) * 100) / 100;
}

export function billingLineItemsService(supabase: SupabaseClient) {
  const repo = billingLineItemsRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    async replaceAll(organizationId: string, grantProjectId: string, rawItems: BillingLineItemInput[], source: "ai" | "manual") {
      const items = rawItems
        .map((it) => ({
          label: it.label.trim().slice(0, 300),
          description: it.description && it.description.trim() ? it.description.trim().slice(0, 2000) : null,
          amount: clampAmount(it.amount),
          hours: it.hours != null && Number.isFinite(it.hours) && it.hours >= 0 ? Math.round(Math.min(it.hours, 100_000) * 100) / 100 : null,
        }))
        .filter((it) => it.label.length > 0)
        .slice(0, 40);
      return repo.replaceAll(organizationId, grantProjectId, items, source);
    },
  };
}
