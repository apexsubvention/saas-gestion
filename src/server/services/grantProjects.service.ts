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

    async updateName(id: string, name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Le titre du dossier est requis.");
      if (trimmed.length > 200) throw new Error("Le titre du dossier est trop long (200 caractères maximum).");
      return repo.updateName(id, trimmed);
    },
  };
}
