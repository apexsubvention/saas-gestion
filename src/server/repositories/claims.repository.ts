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
