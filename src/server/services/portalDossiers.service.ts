import type { SupabaseClient } from "@supabase/supabase-js";
import { grantProjectsRepository } from "@/server/repositories/grantProjects.repository";
import { claimsRepository, type ClaimRow } from "@/server/repositories/claims.repository";
import {
  claimRequirementsRepository,
  type ClaimRequirementRow,
  OPEN_REQUIREMENT_STATUSES,
} from "@/server/repositories/claimRequirements.repository";
import { questionnaireService } from "@/server/services/questionnaire.service";
import { GRANT_PROJECT_STATUS_LABELS } from "@/features/grants/constants";

// Assemble, pour le portail client, tout ce qui est associé à un dossier -- statut/dates,
// réclamations (+ documents manquants), texte rédigé du questionnaire -- en une seule
// structure par dossier. Ne fait AUCUN filtre par client ici : grantProjectsRepository.list()
// n'a pas de clause .eq(client_id, ...), donc c'est la RLS (can_access_client /
// can_access_grant_project, cf. 0028 et 0044) qui restreint déjà le résultat aux dossiers
// réellement accessibles à ce compte portail -- y compris ceux de ses clients enfants
// (hiérarchie). Même principe que projectSuppliers.repository.ts#listBySupplierClient,
// déjà utilisé ainsi par la page portail existante.

export type PortalClaimView = ClaimRow & { openRequirements: ClaimRequirementRow[] };

export type PortalRedactionItem = {
  id: string;
  prompt: string;
  text: string;
  // D'où vient le texte affiché : aide le client à savoir si c'est encore un brouillon
  // (potentiellement généré par IA, à ne pas prendre pour définitif) ou déjà validé.
  stage: "final" | "user_draft" | "ai_draft";
};

export type PortalDossier = {
  id: string;
  name: string;
  clientName: string | null;
  programName: string | null;
  status: string;
  statusLabel: string;
  officialStartDate: string | null;
  officialEndDate: string | null;
  approvedGrantAmount: number | null;
  claims: PortalClaimView[];
  redaction: PortalRedactionItem[];
};

export function portalDossiersService(supabase: SupabaseClient) {
  const grantProjects = grantProjectsRepository(supabase);
  const claims = claimsRepository(supabase);
  const claimRequirements = claimRequirementsRepository(supabase);
  const questionnaire = questionnaireService(supabase);

  return {
    async listDossiers(): Promise<PortalDossier[]> {
      const projects = (await grantProjects.list()) as Array<{
        id: string;
        name: string;
        status: string;
        official_start_date: string | null;
        official_end_date: string | null;
        approved_grant_amount: number | null;
        clients: { name: string } | null;
        grant_programs: { name: string } | null;
      }>;

      const dossiers = await Promise.all(
        projects.map(async (p): Promise<PortalDossier> => {
          const [claimRows, questionnaireData] = await Promise.all([
            claims.listByProject(p.id),
            questionnaire.get(p.id),
          ]);

          const claimsWithRequirements: PortalClaimView[] = await Promise.all(
            claimRows.map(async (c): Promise<PortalClaimView> => {
              const requirements = await claimRequirements.listByClaim(c.id);
              return {
                ...c,
                openRequirements: requirements.filter((r) => OPEN_REQUIREMENT_STATUSES.includes(r.status)),
              };
            })
          );

          const redaction: PortalRedactionItem[] = questionnaireData.items
            .map((q): PortalRedactionItem | null => {
              const text = q.answer.final_text || q.answer.user_draft || q.answer.ai_draft;
              if (!text) return null;
              const stage: PortalRedactionItem["stage"] = q.answer.final_text
                ? "final"
                : q.answer.user_draft
                  ? "user_draft"
                  : "ai_draft";
              return { id: q.id, prompt: q.prompt, text, stage };
            })
            .filter((item): item is PortalRedactionItem => item !== null);

          return {
            id: p.id,
            name: p.name,
            clientName: p.clients?.name ?? null,
            programName: p.grant_programs?.name ?? null,
            status: p.status,
            statusLabel: GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status,
            officialStartDate: p.official_start_date,
            officialEndDate: p.official_end_date,
            approvedGrantAmount: p.approved_grant_amount,
            claims: claimsWithRequirements,
            redaction,
          };
        })
      );

      return dossiers.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
