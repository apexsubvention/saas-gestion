import type { SupabaseClient } from "@supabase/supabase-js";

export type GrantProjectRow = {
  id: string;
  organization_id: string;
  client_id: string;
  program_id: string;
  name: string;
  status: string;
  official_start_date: string | null;
  official_end_date: string | null;
  internal_target_end_date: string | null;
  total_project_cost: number | null;
  approved_grant_amount: number | null;
  grant_rate: number | null;
  health_score: number | null;
  created_at: string;
  // Jade : masquer un dossier d'un client ENFANT du portail de son client PARENT (ex. le
  // dossier ne concerne pas le parent) -- sans le masquer du portail du client lui-même, ni
  // du personnel. Filtré côté application dans portalDossiersService.listDossiers(), pas par
  // RLS -- voir 0056 pour le raisonnement complet.
  hidden_from_parent_portal: boolean;
  // Jade (0064) : certaines subventions ne demandent jamais de preuve de paiement des factures
  // fournisseurs -- réglage par dossier, true par défaut (comportement inchangé pour les
  // dossiers existants). Contrôle uniquement l'affichage du bloc "Preuve de paiement" côté
  // portail client -- voir portalDossiers.service.ts / PortalSupplierInvoices.tsx.
  requires_payment_proof: boolean;
  // Jade (0065, PARI CNRC/IRAP) : solde restant de l'année financière -- lu automatiquement à
  // chaque rapport "Historique DDR" téléversé (label = l'année financière indiquée, ex.
  // "2024-2025"), mais reste modifiable à la main. Aucune autre source de vérité pour cette valeur
  // dans Apex -- voir la migration 0065 et PariBalance.tsx.
  pari_balance_remaining: number | null;
  pari_balance_label: string | null;
  pari_balance_updated_at: string | null;
  // Jade (0071, chantier 2) : texte libre montré au client pendant que le statut du dossier est
  // "opportunity_to_confirm" -- voir updateOpportunityDetails ci-dessous.
  opportunity_angle_notes: string | null;
  // Jade (0072, chantier 2 suite) : estimation du personnel PROPRE à ce dossier (distincte du
  // montant max / % générique du programme, déjà montrés via program_snapshots) -- « potentiel $
  // qu'on peut aller chercher » et son taux de remboursement, modifiables en tout temps.
  opportunity_potential_amount: number | null;
  opportunity_reimbursement_rate: number | null;
  // Réponse du client à cette opportunité (portail) -- voir grants/(portal)/(app)/actions.ts,
  // respondToOpportunityAction.
  client_opportunity_response: "interested" | "not_interested" | null;
  client_opportunity_response_at: string | null;
};

export function grantProjectsRepository(supabase: SupabaseClient) {
  return {
    async list() {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, clients(name, parent_client_id), grant_programs(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },

    async listByClient(clientId: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, grant_programs(name)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },

    async findById(id: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*, clients(name, parent_client_id), grant_programs(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async findExisting(clientId: string, programId: string, name: string) {
      const { data, error } = await supabase
        .from("grant_projects")
        .select("*")
        .eq("client_id", clientId)
        .eq("program_id", programId)
        .ilike("name", name.trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as GrantProjectRow | null;
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      program_id: string;
      name: string;
      owner_id?: string | null;
      status?: string;
      description?: string | null;
      total_project_cost?: number | null;
      approved_grant_amount?: number | null;
      grant_rate?: number | null;
      official_start_date?: string | null;
      official_end_date?: string | null;
    }): Promise<GrantProjectRow> {
      const { data, error } = await supabase.from("grant_projects").insert(input).select().single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    async updateStatus(id: string, status: string): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    async updateHiddenFromParentPortal(id: string, hidden: boolean): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ hidden_from_parent_portal: hidden, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    async updateRequiresPaymentProof(id: string, required: boolean): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ requires_payment_proof: required, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    // Jade (0068) : coût total du projet / montant approuvé / taux d'aide n'étaient modifiables
    // qu'à la création du dossier -- désormais éditables en tout temps depuis la section « Ce qui a
    // été déposé » (mode simple, tant qu'aucun poste détaillé n'existe -- voir budgetLines.service).
    async updateFinancials(id: string, patch: { total_project_cost: number | null; approved_grant_amount: number | null; grant_rate: number | null }): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    // Jade : le titre du dossier n'était modifiable qu'à la création -- ajouté pour corriger une
    // erreur de saisie après coup (ex. mauvais nom de projet).
    async updateName(id: string, name: string): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    // Jade (0065) : « actualiser le montant restant facilement » -- appelé automatiquement après
    // la lecture d'un rapport Historique DDR (quand le solde y est lisible), et disponible en
    // modification manuelle (PariBalance.tsx) pour corriger/compléter à tout moment.
    async updatePariBalance(id: string, remaining: number | null, label: string | null): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ pari_balance_remaining: remaining, pari_balance_label: label, pari_balance_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    // Jade (0071/0072, chantier 2) : « angles possibles pour vous » (texte libre) + « potentiel $
    // qu'on peut aller chercher » / « % de remboursement » (estimation du personnel propre à ce
    // dossier) -- montrés au client tant que le dossier est "opportunity_to_confirm". Toujours
    // modifiables (pas un program_snapshots figé) -- voir OpportunityAngleNotes.tsx.
    async updateOpportunityDetails(
      id: string,
      input: { notes: string | null; potentialAmount: number | null; reimbursementRate: number | null }
    ): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({
          opportunity_angle_notes: input.notes,
          opportunity_potential_amount: input.potentialAmount,
          opportunity_reimbursement_rate: input.reimbursementRate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },

    // Réponse du client (portail) -- écrite par respondToOpportunityAction (admin/service role,
    // même raison que pour les autres écritures portail : pas de policy UPDATE portail sur
    // grant_projects, une policy RLS ne peut pas restreindre l'écriture à seulement ces 2
    // colonnes -- voir actions.ts du portail).
    async updateClientOpportunityResponse(id: string, response: "interested" | "not_interested" | null): Promise<GrantProjectRow> {
      const { data, error } = await supabase
        .from("grant_projects")
        .update({ client_opportunity_response: response, client_opportunity_response_at: response ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as GrantProjectRow;
    },
  };
}
