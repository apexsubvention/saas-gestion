import type { SupabaseClient } from "@supabase/supabase-js";
import { grantProjectsRepository } from "@/server/repositories/grantProjects.repository";
import { claimsRepository, type ClaimRow } from "@/server/repositories/claims.repository";
import {
  claimRequirementsRepository,
  type ClaimRequirementRow,
  OPEN_REQUIREMENT_STATUSES,
} from "@/server/repositories/claimRequirements.repository";
import { documentRequestsRepository, type DocumentRequestRow } from "@/server/repositories/documentRequests.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { questionnaireService } from "@/server/services/questionnaire.service";
import { dossierNotesService, type DossierNoteView } from "@/server/services/dossierNotes.service";
import { GRANT_PROJECT_STATUS_LABELS, DOCUMENT_REQUEST_STATUS_LABELS } from "@/features/grants/constants";

// Assemble, pour le portail client, tout ce qui est associé à un dossier -- statut/dates,
// réclamations (+ documents manquants), texte rédigé du questionnaire, documents
// demandés -- en une seule structure par dossier. Ne fait AUCUN filtre par client ici :
// grantProjectsRepository.list() n'a pas de clause .eq(client_id, ...), donc c'est la RLS
// (can_access_client / can_access_grant_project, cf. 0028 et 0044) qui restreint déjà le
// résultat aux dossiers réellement accessibles à ce compte portail -- y compris ceux de
// ses clients enfants (hiérarchie). Même principe que
// projectSuppliers.repository.ts#listBySupplierClient, déjà utilisé ainsi par la page
// portail existante.

// Un dossier refusé n'intéresse plus le client au quotidien -- Jade a demandé à ce
// qu'il disparaisse du portail (il reste bien sûr visible côté interne).
const HIDDEN_PROJECT_STATUSES = ["rejected"];

// Statuts de document_requests montrés au portail : jamais "not_required" (le personnel
// a décidé que ce n'était plus utile) ni "not_requested" (pas encore réellement demandé --
// ne devrait pas arriver via l'UI actuelle, mais on l'exclut par prudence).
const VISIBLE_REQUEST_STATUSES = ["requested", "received", "validated", "issue"];

export type PortalDocumentRequestView = {
  id: string;
  title: string;
  instructions: string | null;
  documentType: string;
  dueDate: string | null;
  status: string;
  statusLabel: string;
  filename: string | null;
};

export type PortalClaimView = ClaimRow & {
  openRequirements: ClaimRequirementRow[];
  documentRequests: PortalDocumentRequestView[];
};

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
  clientId: string;
  clientName: string | null;
  programName: string | null;
  status: string;
  statusLabel: string;
  officialStartDate: string | null;
  officialEndDate: string | null;
  approvedGrantAmount: number | null;
  claims: PortalClaimView[];
  redaction: PortalRedactionItem[];
  // Documents demandés au niveau du dossier (claim_id vide -- ex. en vue d'un dépôt),
  // par opposition à ceux rattachés à une réclamation précise (déjà dans claims[].documentRequests).
  documentRequests: PortalDocumentRequestView[];
  notes: DossierNoteView[];
};

export function portalDossiersService(supabase: SupabaseClient) {
  const grantProjects = grantProjectsRepository(supabase);
  const claims = claimsRepository(supabase);
  const claimRequirements = claimRequirementsRepository(supabase);
  const documentRequests = documentRequestsRepository(supabase);
  const documents = documentsRepository(supabase);
  const questionnaire = questionnaireService(supabase);
  const notes = dossierNotesService(supabase);

  return {
    async listDossiers(): Promise<PortalDossier[]> {
      const allProjects = (await grantProjects.list()) as Array<{
        id: string;
        name: string;
        client_id: string;
        status: string;
        official_start_date: string | null;
        official_end_date: string | null;
        approved_grant_amount: number | null;
        clients: { name: string } | null;
        grant_programs: { name: string } | null;
      }>;
      const projects = allProjects.filter((p) => !HIDDEN_PROJECT_STATUSES.includes(p.status));

      const dossiers = await Promise.all(
        projects.map(async (p): Promise<PortalDossier> => {
          const [claimRows, questionnaireData, requestRows, noteRows] = await Promise.all([
            claims.listByProject(p.id),
            questionnaire.get(p.id),
            documentRequests.listByProject(p.id),
            notes.listByProject(p.id),
          ]);

          const visibleRequests = requestRows.filter(
            (r) => r.visible_in_client_portal && VISIBLE_REQUEST_STATUSES.includes(r.status)
          );
          const requestLinks = await documents.listDocumentRequestLinks(visibleRequests.map((r) => r.id));
          const filenameByRequestId = new Map(requestLinks.map((l) => [l.request_id, l.filename]));

          const toView = (r: DocumentRequestRow): PortalDocumentRequestView => ({
            id: r.id,
            title: r.title,
            instructions: r.instructions,
            documentType: r.document_type,
            dueDate: r.due_date,
            status: r.status,
            statusLabel: DOCUMENT_REQUEST_STATUS_LABELS[r.status] ?? r.status,
            filename: filenameByRequestId.get(r.id) ?? null,
          });

          const claimsWithRequirements: PortalClaimView[] = await Promise.all(
            claimRows.map(async (c): Promise<PortalClaimView> => {
              const requirements = await claimRequirements.listByClaim(c.id);
              return {
                ...c,
                openRequirements: requirements.filter((r) => OPEN_REQUIREMENT_STATUSES.includes(r.status)),
                documentRequests: visibleRequests.filter((r) => r.claim_id === c.id).map(toView),
              };
            })
          );

          const projectLevelRequests = visibleRequests.filter((r) => !r.claim_id).map(toView);

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
            clientId: p.client_id,
            clientName: p.clients?.name ?? null,
            programName: p.grant_programs?.name ?? null,
            status: p.status,
            statusLabel: GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status,
            officialStartDate: p.official_start_date,
            officialEndDate: p.official_end_date,
            approvedGrantAmount: p.approved_grant_amount,
            claims: claimsWithRequirements,
            redaction,
            documentRequests: projectLevelRequests,
            notes: noteRows,
          };
        })
      );

      return dossiers.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
