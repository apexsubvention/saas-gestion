import type { SupabaseClient } from "@supabase/supabase-js";

// Intérêt signalé par un client, depuis le portail, pour une opportunité de la veille
// (funding_opportunities) -- voir 0052_client_opportunity_interests.sql. Un client ne peut créer
// qu'une ligne par (client_id, opportunity_id) ; seul le personnel change le statut ensuite.

export type OpportunityInterestStatus = "new" | "viewed" | "contacted" | "dismissed";

export type ClientOpportunityInterestRow = {
  id: string;
  organization_id: string;
  client_id: string;
  opportunity_id: string;
  submitted_by: string | null;
  note: string | null;
  status: OpportunityInterestStatus;
  created_at: string;
  updated_at: string;
  // Jointure funding_opportunities(title, ...) -- pratique pour l'affichage admin sans requête séparée.
  funding_opportunities?: { title: string | null; external_url: string | null; official_url: string | null } | null;
};

export function clientOpportunityInterestsRepository(supabase: SupabaseClient) {
  return {
    async listByClient(clientId: string): Promise<ClientOpportunityInterestRow[]> {
      const { data, error } = await supabase
        .from("client_opportunity_interests")
        .select("*, funding_opportunities(title, external_url, official_url)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ClientOpportunityInterestRow[];
    },

    async findByClientAndOpportunity(clientId: string, opportunityId: string): Promise<ClientOpportunityInterestRow | null> {
      const { data, error } = await supabase
        .from("client_opportunity_interests")
        .select("*")
        .eq("client_id", clientId)
        .eq("opportunity_id", opportunityId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClientOpportunityInterestRow) ?? null;
    },

    async create(input: {
      organizationId: string;
      clientId: string;
      opportunityId: string;
      submittedBy: string | null;
      note: string | null;
    }): Promise<ClientOpportunityInterestRow> {
      const { data, error } = await supabase
        .from("client_opportunity_interests")
        .insert({
          organization_id: input.organizationId,
          client_id: input.clientId,
          opportunity_id: input.opportunityId,
          submitted_by: input.submittedBy,
          note: input.note,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ClientOpportunityInterestRow;
    },

    async updateStatus(id: string, status: OpportunityInterestStatus): Promise<void> {
      const { error } = await supabase
        .from("client_opportunity_interests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
  };
}
