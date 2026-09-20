// Voir supabase/migrations/0006_suppliers_budget_tasks.sql pour le schema complet et
// 0016_rls_policies.sql pour tasks_select/insert/update (accès via grant_project_id OU
// client_id -- une tâche peut être rattachée à l'un, l'autre, ou les deux).
import type { SupabaseClient } from "@supabase/supabase-js";

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

    async create(input: {
      organization_id: string;
      title: string;
      description?: string | null;
      client_id?: string | null;
      grant_project_id?: string | null;
      assigned_to?: string | null;
      due_date?: string | null;
      priority?: string;
      status?: string;
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
  };
}

export function tasksListAll(supabase: SupabaseClient) {
  return async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, grant_projects(name, client_id, clients(name)), clients(name)")
      .neq("status", "done")
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data;
  };
}
