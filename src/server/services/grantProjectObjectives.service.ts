import type { SupabaseClient } from "@supabase/supabase-js";
import { grantProjectObjectivesRepository } from "@/server/repositories/grantProjectObjectives.repository";

export function grantProjectObjectivesService(supabase: SupabaseClient) {
  const repo = grantProjectObjectivesRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async replaceAll(organizationId: string, grantProjectId: string, rawLabels: string[]) {
      const labels = rawLabels
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => l.slice(0, 600))
        .slice(0, 20);
      return repo.replaceAll(organizationId, grantProjectId, labels);
    },
  };
}
