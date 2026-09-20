import type { SupabaseClient } from "@supabase/supabase-js";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { milestonesService } from "@/server/services/milestones.service";
import type { SaveAgreementInput } from "@/features/grants/agreementSchema";

// Statuts qu'une entente peut faire évoluer. « Refusé » et « Complété » ne sont jamais modifiés
// automatiquement.
const AUTO_STATUS_FROM = ["draft", "pending_approval", "approved", "awaiting_claim"];

export type SaveAgreementResult = {
  created: number; // échéances de réclamation ajoutées
  skipped: number; // déjà présentes
  status: string; // statut du dossier après l'opération
  statusChanged: boolean;
};

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

    // Enregistre (crée ou met à jour) l'entente, crée les échéances de réclamation à partir de ses
    // dates, puis fait évoluer le statut du dossier : « Approuvé — en attente de réclamation » si le
    // dossier a des dates de réclamation, sinon « Approuvé ». Idempotent : ré-enregistrer l'entente ne
    // duplique aucune échéance (voir milestonesService.suggestForProject).
    async saveAndSchedule(organizationId: string, grantProjectId: string, input: SaveAgreementInput): Promise<SaveAgreementResult> {
      const fields = {
        project_start: input.project_start,
        project_end: input.project_end,
        eligible_expense_period_start: input.eligible_expense_period_start,
        eligible_expense_period_end: input.eligible_expense_period_end,
        grant_amount: input.grant_amount,
        grant_rate: input.grant_rate_percent == null ? null : input.grant_rate_percent / 100,
        claim_frequency: input.claim_frequency || null,
        special_conditions: input.special_conditions || null,
      };

      const existing = (await repo.listByProject(grantProjectId))[0];
      if (existing) await repo.update(existing.id, fields);
      else await repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, ...fields });

      const milestones = milestonesService(supabase);
      const { created, skipped } = await milestones.suggestForProject(organizationId, grantProjectId, {
        eligible_expense_period_start: fields.eligible_expense_period_start,
        eligible_expense_period_end: fields.eligible_expense_period_end,
        project_end: fields.project_end,
      });

      const hasClaimDates = (await milestones.listByProject(grantProjectId)).some((m) => m.type === "claim" && m.status !== "cancelled");
      const projects = grantProjectsService(supabase);
      const project = await projects.get(grantProjectId);
      let status = project?.status ?? "draft";
      let statusChanged = false;
      if (project && AUTO_STATUS_FROM.includes(project.status)) {
        const target = hasClaimDates ? "awaiting_claim" : "approved";
        if (project.status !== target) {
          await projects.updateStatus(grantProjectId, target);
          status = target;
          statusChanged = true;
        }
      }
      return { created, skipped, status, statusChanged };
    },
  };
}
