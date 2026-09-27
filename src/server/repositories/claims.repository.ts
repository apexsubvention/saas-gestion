import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  claim_number: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string;
  claimed_amount: number | null;
  approved_amount: number | null;
  progress_report: string | null;
};

export function claimsRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ClaimRow[]> {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("period_start", { ascending: true });
      if (error) throw error;
      return data as ClaimRow[];
    },

    // Jade (0067, PARI CNRC) : une réclamation par DDR, retrouvée par son claim_number avant d'en
    // créer une nouvelle -- idempotent si le même rapport « Historique DDR » est retéléversé (pas
    // de doublon), voir supplierLedger.service.ts#recordAnalyzedDdrReport. claim_number n'a pas de
    // contrainte unique en base (saisie libre côté formulaire manuel existant), d'où cette
    // recherche explicite plutôt qu'un upsert.
    async findByProjectAndNumber(grantProjectId: string, claimNumber: string): Promise<ClaimRow | null> {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .eq("claim_number", claimNumber)
        .maybeSingle();
      if (error) throw error;
      return (data as ClaimRow | null) ?? null;
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      claim_number?: string | null;
      period_start?: string | null;
      period_end?: string | null;
      due_date?: string | null;
      status?: string;
      progress_report?: string | null;
    }): Promise<ClaimRow> {
      const { data, error } = await supabase.from("claims").insert(input).select().single();
      if (error) throw error;
      return data as ClaimRow;
    },

    // Renvoie le nombre de lignes supprimées : 0 = refusé par les règles d'accès.
    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("claims").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async updateStatus(id: string, status: string): Promise<ClaimRow> {
      const { data, error } = await supabase.from("claims").update({ status }).eq("id", id).select().single();
      if (error) throw error;
      return data as ClaimRow;
    },

    // Reprogrammation depuis le glisser-déposer de la vue Kanban de l'échéancier --
    // voir src/app/(dashboard)/echeancier/actions.ts.
    async updateDueDate(id: string, dueDate: string): Promise<ClaimRow> {
      const { data, error } = await supabase
        .from("claims")
        .update({ due_date: dueDate })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ClaimRow;
    },
  };
}

// Même raisonnement que milestonesListAll/tasksListAll : une réclamation payée/refusée
// (terminale) est nécessaire pour le seau "Terminé" de l'échéancier priorisé, mais une
// requête unique "tous statuts" laisserait d'anciennes réclamations payées écraser la
// limite réservée aux réclamations actives.
const CLAIM_SELECT = "*, grant_projects(name, client_id, clients(name), grant_programs(name))";

export function claimsListAll(supabase: SupabaseClient) {
  return async () => {
    // Les éléments terminés n'apparaissent plus dans l'échéancier : on ne charge que les actifs.
    const { data, error } = await supabase
      .from("claims")
      .select(CLAIM_SELECT)
        .neq("status", "paid")
        .neq("status", "rejected")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data;
  };
}
