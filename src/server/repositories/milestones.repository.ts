// Voir supabase/migrations/0005_agreements_milestones.sql. Cette table existait déjà
// dans le schéma (type claim/report/document/... + source manual/template/ai_proposed)
// mais n'était utilisée nulle part dans l'UI avant l'échéancier -- voir grants/[id]/page.tsx.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MilestoneRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  type: string;
  title: string;
  official_due_date: string | null;
  internal_due_date: string | null;
  status: string;
  priority: string;
  source: string;
  created_at: string;
};

export function milestonesRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<MilestoneRow[]> {
      const { data, error } = await supabase
        .from("milestones")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("internal_due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as MilestoneRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      type: string;
      title: string;
      internal_due_date?: string | null;
      official_due_date?: string | null;
      source?: string;
    }): Promise<MilestoneRow> {
      const { data, error } = await supabase.from("milestones").insert(input).select().single();
      if (error) throw error;
      return data as MilestoneRow;
    },

    async updateStatus(id: string, status: string): Promise<MilestoneRow> {
      const { data, error } = await supabase.from("milestones").update({ status }).eq("id", id).select().single();
      if (error) throw error;
      return data as MilestoneRow;
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from("milestones").delete().eq("id", id);
      if (error) throw error;
    },

    // Reprogrammation depuis le glisser-déposer de la vue Kanban de l'échéancier --
    // voir src/app/(dashboard)/echeancier/actions.ts.
    async updateDueDate(id: string, dueDate: string): Promise<MilestoneRow> {
      const { data, error } = await supabase
        .from("milestones")
        .update({ internal_due_date: dueDate })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as MilestoneRow;
    },
  };
}

// Deux requêtes plutôt qu'une seule "tous statuts" : l'échéancier priorisé (vues
// Priorités/Kanban, voir src/features/schedule/) a maintenant besoin des jalons
// terminés pour peupler le seau "Terminé", mais sans qu'un jalon complété il y a des
// mois (date passée) n'écrase la limite de 200 lignes réservée aux jalons actifs.
const MILESTONE_SELECT = "*, grant_projects(name, client_id, clients(name), grant_programs(name))";
const MILESTONE_TERMINAL_STATUSES = ["done", "cancelled"];
const MILESTONE_DONE_LIMIT = 30;

export function milestonesListAll(supabase: SupabaseClient) {
  return async () => {
    const [active, done] = await Promise.all([
      supabase
        .from("milestones")
        .select(MILESTONE_SELECT)
        .neq("status", "done")
        .neq("status", "cancelled")
        .order("internal_due_date", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("milestones")
        .select(MILESTONE_SELECT)
        .in("status", MILESTONE_TERMINAL_STATUSES)
        .order("internal_due_date", { ascending: false, nullsFirst: true })
        .limit(MILESTONE_DONE_LIMIT),
    ]);
    if (active.error) throw active.error;
    if (done.error) throw done.error;
    return [...active.data, ...done.data];
  };
}
