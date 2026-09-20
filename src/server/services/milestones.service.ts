import type { SupabaseClient } from "@supabase/supabase-js";
import { milestonesRepository } from "@/server/repositories/milestones.repository";
import { suggestMilestonesFromAgreement } from "@/server/scheduling/suggestMilestones";
import { MILESTONE_STATUS_LABELS } from "@/features/grants/constants";

export function milestonesService(supabase: SupabaseClient) {
  const repo = milestonesRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    async updateStatus(id: string, status: string) {
      if (!(status in MILESTONE_STATUS_LABELS)) {
        throw new Error(`Statut d'échéance invalide : ${status}`);
      }
      return repo.updateStatus(id, status);
    },

    remove: (id: string) => repo.remove(id),

    // Idempotent : ne recrée pas une suggestion déjà présente pour ce projet (même
    // titre exact), pour que cliquer plusieurs fois sur "Suggérer l'échéancier" ne
    // duplique rien.
    async suggestForProject(
      organizationId: string,
      grantProjectId: string,
      agreement: { eligible_expense_period_start: string | null; eligible_expense_period_end: string | null; project_end: string | null }
    ) {
      const suggestions = suggestMilestonesFromAgreement(agreement);
      if (suggestions.length === 0) {
        return { created: 0, skipped: 0 };
      }

      const existing = await repo.listByProject(grantProjectId);
      const existingTitles = new Set(existing.map((m) => m.title));

      let created = 0;
      let skipped = 0;
      for (const s of suggestions) {
        if (existingTitles.has(s.title)) {
          skipped += 1;
          continue;
        }
        await repo.create({
          organization_id: organizationId,
          grant_project_id: grantProjectId,
          type: s.type,
          title: s.title,
          internal_due_date: s.internal_due_date,
          source: "ai_proposed",
        });
        created += 1;
      }
      return { created, skipped };
    },
  };
}
