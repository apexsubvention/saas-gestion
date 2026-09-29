// Voir supabase/migrations/0006_suppliers_budget_tasks.sql pour le schema complet et
// 0016_rls_policies.sql pour tasks_select/insert/update (accès via grant_project_id OU
// client_id -- une tâche peut être rattachée à l'un, l'autre, ou les deux).
import type { SupabaseClient } from "@supabase/supabase-js";

// 0069 -- structurellement identique au TaskTargetKind de taskTargetOptions.ts (route
// grants/[id], jamais importé ici pour ne pas faire dépendre ce fichier serveur partagé d'un
// dossier de route) -- TypeScript les unifie par structure. Corrige le bug de build du 29/09 :
// tasks.service.ts utilisait "string" là où TaskRow.target_kind exige ce type précis
// (Partial<Pick<TaskRow, ...>> refuse un "string" trop large).
export type TaskTargetKind = "client" | "parent_client" | "child_client" | "supplier";

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  grant_project_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  source: string;
  created_at: string;
  // 0069 -- Jade : attribuer la tâche à quelqu'un d'autre que le client du dossier. target_kind
  // n'est qu'une étiquette d'affichage/filtre ('client' = comportement historique, seule valeur
  // possible avant 0069) ; l'accès réel (RLS) dépend uniquement de client_id/supplier_id.
  target_kind: TaskTargetKind;
  supplier_id: string | null;
  // Défaut false : une tâche n'apparaît dans le portail (client ou fournisseur visé) que si
  // explicitement cochée « Visible dans son portail » -- voir tasks_portal_select (0069).
  visible_in_portal: boolean;
};

export function tasksRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<TaskRow[]> {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as TaskRow[];
    },

    async update(
      id: string,
      patch: Partial<
        Pick<TaskRow, "title" | "description" | "due_date" | "priority" | "status" | "assigned_to" | "client_id" | "target_kind" | "supplier_id" | "visible_in_portal">
      > & { claim_id?: string | null }
    ): Promise<TaskRow> {
      const { data, error } = await supabase.from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as TaskRow;
    },

    // Nombre de lignes supprimées : 0 = refusé par la RLS (ou déjà supprimée).
    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async create(input: {
      organization_id: string;
      title: string;
      description?: string | null;
      claim_id?: string | null;
      client_id?: string | null;
      grant_project_id?: string | null;
      assigned_to?: string | null;
      due_date?: string | null;
      priority?: string;
      status?: string;
      target_kind?: TaskTargetKind;
      supplier_id?: string | null;
      visible_in_portal?: boolean;
    }): Promise<TaskRow> {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...input, source: "manual" })
        .select()
        .single();
      if (error) throw error;
      return data as TaskRow;
    },

    async updateStatus(id: string, status: string): Promise<TaskRow> {
      const { data, error } = await supabase
        .from("tasks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as TaskRow;
    },

    // Reprogrammation depuis le glisser-déposer de la vue Kanban de l'échéancier --
    // voir src/app/(dashboard)/echeancier/actions.ts.
    async updateDueDate(id: string, dueDate: string): Promise<TaskRow> {
      const { data, error } = await supabase
        .from("tasks")
        .update({ due_date: dueDate, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as TaskRow;
    },
  };
}

// Même raisonnement que milestonesListAll : deux requêtes pour que le seau "Terminé"
// de l'échéancier priorisé n'écrase pas la limite réservée aux tâches actives.
const TASK_SELECT = "*, grant_projects(name, client_id, clients(name), grant_programs(name)), clients(name)";

export function tasksListAll(supabase: SupabaseClient) {
  return async () => {
    // Les éléments terminés n'apparaissent plus dans l'échéancier : on ne charge que les actifs.
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
        .neq("status", "done")
        .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data;
  };
}
