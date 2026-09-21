import type { SupabaseClient } from "@supabase/supabase-js";
import { milestonesRepository } from "@/server/repositories/milestones.repository";
import { suggestMilestonesFromAgreement } from "@/server/scheduling/suggestMilestones";
import { MILESTONE_STATUS_LABELS } from "@/features/grants/constants";
import { milestoneDedupeKey } from "@/features/schedule/dismissals";

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

    create: (input: Parameters<typeof repo.create>[0]) => repo.create(input),
    remove: (id: string) => repo.remove(id),
    updateDueDate: (id: string, dueDate: string) => repo.updateDueDate(id, dueDate),

    // Idempotent : ne recrée pas une suggestion déjà présente pour ce projet, parmi les
    // jalons source='ai_proposed'. Clé de dédoublonnage :
    //  - type 'project_end'/'eligibility_end' : par TYPE seul -- une entente n'a qu'une
    //    seule date de fin de projet et qu'une seule fin de période d'admissibilité, donc
    //    au plus une suggestion de chaque peut jamais exister ; dédoublonner par type reste
    //    valide même si le libellé généré est reformulé plus tard (contrairement à une
    //    comparaison de titre exact).
    //  - type 'claim' : par TITRE exact (comme avant) -- il existe légitimement DEUX
    //    suggestions de type 'claim' (mi-projet et finale), donc dédoublonner par type
    //    seul fusionnerait les deux à tort.
    async suggestForProject(
      organizationId: string,
      grantProjectId: string,
      agreement: { eligible_expense_period_start: string | null; eligible_expense_period_end: string | null; project_end: string | null },
      // dismissed : clés d'éléments automatiques que l'utilisateur a supprimés à la main -> jamais recréés.
      opts: { skipClaimSuggestions?: boolean; dismissed?: Set<string> } = {}
    ) {
      // Régime mensuel (DDR) : les réclamations sont de vrais dossiers créés à part, on ne suggère
      // donc que les dates de fin de projet / d'admissibilité.
      const suggestions = suggestMilestonesFromAgreement(agreement).filter((s) => !(opts.skipClaimSuggestions && s.type === "claim"));
      if (suggestions.length === 0) {
        return { created: 0, skipped: 0 };
      }

      const existing = await repo.listByProject(grantProjectId);
      const aiProposed = existing.filter((m) => m.source === "ai_proposed");
      const dedupeKey = milestoneDedupeKey;
      const existingKeys = new Set(aiProposed.map((m) => dedupeKey(m.type, m.title)));

      let created = 0;
      let skipped = 0;
      for (const s of suggestions) {
        const key = dedupeKey(s.type, s.title);
        if (existingKeys.has(key) || opts.dismissed?.has(key)) {
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
        existingKeys.add(key);
        created += 1;
      }
      return { created, skipped };
    },
  };
}
