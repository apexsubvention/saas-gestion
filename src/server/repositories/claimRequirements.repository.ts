import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimRequirementRow = {
  id: string;
  organization_id: string;
  claim_id: string;
  label: string;
  status: string;
};

// Statuts qui ne comptent PAS comme "élément manquant" pour une réclamation --
// tout le reste (missing/requested/received/issue) bloque encore la préparation.
// Exporté : réutilisé tel quel par le portail (portalDossiers.service.ts) pour afficher
// "documents à fournir" à partir des mêmes règles, sans dupliquer la liste de statuts.
export const OPEN_REQUIREMENT_STATUSES = ["missing", "requested", "received", "issue"];

export function claimRequirementsRepository(supabase: SupabaseClient) {
  return {
    async listByClaim(claimId: string): Promise<ClaimRequirementRow[]> {
      const { data, error } = await supabase
        .from("claim_requirements")
        .select("*")
        .eq("claim_id", claimId)
        .order("label", { ascending: true });
      if (error) throw error;
      return data as ClaimRequirementRow[];
    },

    // Utilisé par l'échéancier (vue Priorités/Kanban) pour afficher "X éléments
    // manquants" par réclamation sans faire une requête par réclamation (N+1) --
    // un seul select `in (...)`, regroupé en mémoire ensuite.
    async countOpenByClaimIds(claimIds: string[]): Promise<Record<string, number>> {
      if (claimIds.length === 0) return {};
      const { data, error } = await supabase
        .from("claim_requirements")
        .select("claim_id, status")
        .in("claim_id", claimIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data as Array<{ claim_id: string; status: string }>) {
        if (OPEN_REQUIREMENT_STATUSES.includes(row.status)) {
          counts[row.claim_id] = (counts[row.claim_id] ?? 0) + 1;
        }
      }
      return counts;
    },

    async create(input: { organization_id: string; claim_id: string; label: string; status?: string }): Promise<ClaimRequirementRow> {
      const { data, error } = await supabase.from("claim_requirements").insert(input).select().single();
      if (error) throw error;
      return data as ClaimRequirementRow;
    },

    async updateStatus(id: string, status: string): Promise<ClaimRequirementRow> {
      const { data, error } = await supabase
        .from("claim_requirements")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ClaimRequirementRow;
    },
  };
}
