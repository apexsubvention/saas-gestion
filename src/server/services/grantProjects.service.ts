import type { SupabaseClient } from "@supabase/supabase-js";
import { grantProjectsRepository } from "@/server/repositories/grantProjects.repository";
import { createGrantProjectSchema, type CreateGrantProjectInput } from "@/features/grants/schemas";
import { GRANT_PROJECT_STATUS_LABELS } from "@/features/grants/constants";

export function grantProjectsService(supabase: SupabaseClient) {
  const repo = grantProjectsRepository(supabase);
  return {
    list: () => repo.list(),
    listByClient: (clientId: string) => repo.listByClient(clientId),
    get: (id: string) => repo.findById(id),

    async create(organizationId: string, ownerId: string, input: CreateGrantProjectInput) {
      const parsed = createGrantProjectSchema.parse(input);
      return repo.create({
        organization_id: organizationId,
        client_id: parsed.client_id,
        program_id: parsed.program_id,
        name: parsed.name,
        owner_id: ownerId,
        total_project_cost: parsed.total_project_cost ?? null,
        approved_grant_amount: parsed.approved_grant_amount ?? null,
        official_start_date: parsed.official_start_date || null,
        official_end_date: parsed.official_end_date || null,
      });
    },

    async updateStatus(id: string, status: string) {
      if (!(status in GRANT_PROJECT_STATUS_LABELS)) {
        throw new Error(`Statut invalide : ${status}`);
      }
      return repo.updateStatus(id, status);
    },

    updateHiddenFromParentPortal: (id: string, hidden: boolean) => repo.updateHiddenFromParentPortal(id, hidden),
    updateRequiresPaymentProof: (id: string, required: boolean) => repo.updateRequiresPaymentProof(id, required),

    // Jade (0065, PARI CNRC/IRAP) : solde restant, modifiable à la main ou actualisé
    // automatiquement à la lecture d'un rapport Historique DDR.
    async updatePariBalance(id: string, remaining: number | null, label: string | null) {
      if (remaining != null && (!Number.isFinite(remaining) || remaining < -100_000_000 || remaining > 100_000_000)) {
        throw new Error("Montant invalide.");
      }
      const trimmedLabel = label?.trim() || null;
      if (trimmedLabel && trimmedLabel.length > 100) throw new Error("Libellé trop long (100 caractères maximum).");
      return repo.updatePariBalance(id, remaining, trimmedLabel);
    },

    // Jade (0068) : mode simple de la section « Ce qui a été déposé » -- tant qu'aucun poste détaillé
    // n'existe, ces 3 champs restent la source des totaux du dossier (voir resolveSubsidyInputs).
    async updateFinancials(id: string, input: { total_project_cost: number | null; approved_grant_amount: number | null; grant_rate_percent: number | null }) {
      const money = (v: number | null) => {
        if (v == null) return null;
        if (!Number.isFinite(v) || v < 0 || v > 100_000_000) throw new Error("Montant invalide.");
        return v;
      };
      const ratePercent = input.grant_rate_percent;
      if (ratePercent != null && (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100)) throw new Error("Taux d'aide invalide (0 à 100).");
      return repo.updateFinancials(id, {
        total_project_cost: money(input.total_project_cost),
        approved_grant_amount: money(input.approved_grant_amount),
        grant_rate: ratePercent != null ? Math.round((ratePercent / 100) * 10000) / 10000 : null,
      });
    },

    async updateName(id: string, name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Le titre du dossier est requis.");
      if (trimmed.length > 200) throw new Error("Le titre du dossier est trop long (200 caractères maximum).");
      return repo.updateName(id, trimmed);
    },

    // Jade (0071, chantier 2) : « angles possibles pour vous » -- texte libre du personnel.
    async updateOpportunityAngleNotes(id: string, notes: string) {
      const trimmed = notes.trim();
      if (trimmed.length > 4000) throw new Error("Texte trop long (4000 caractères maximum).");
      return repo.updateOpportunityAngleNotes(id, trimmed || null);
    },

    // Réponse du client (portail) -- voir respondToOpportunityAction.
    async updateClientOpportunityResponse(id: string, response: "interested" | "not_interested" | null) {
      if (response !== null && response !== "interested" && response !== "not_interested") {
        throw new Error("Réponse invalide.");
      }
      return repo.updateClientOpportunityResponse(id, response);
    },
  };
}
