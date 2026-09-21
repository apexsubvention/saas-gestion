import type { SupabaseClient } from "@supabase/supabase-js";
import { tasksRepository } from "@/server/repositories/tasks.repository";
import { TASK_STATUS_LABELS } from "@/features/grants/constants";

export function tasksService(supabase: SupabaseClient) {
  const repo = tasksRepository(supabase);
  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),
    async create(
      organizationId: string,
      input: {
        title: string;
        description?: string | null;
        claim_id?: string | null;
        client_id?: string | null;
        grant_project_id?: string | null;
        assigned_to?: string | null;
        due_date?: string | null;
        priority?: string;
      }
    ) {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Le titre de la tâche est requis.");
      }
      if (!input.client_id && !input.grant_project_id) {
        throw new Error("Une tâche doit être rattachée à un client ou à un dossier.");
      }
      return repo.create({ organization_id: organizationId, ...input });
    },
    async update(
      id: string,
      patch: { title?: string; description?: string | null; due_date?: string | null; priority?: string; status?: string; assigned_to?: string | null }
    ) {
      if (patch.title !== undefined && patch.title.trim().length === 0) throw new Error("Le titre de la tâche est requis.");
      if (patch.status !== undefined && !(patch.status in TASK_STATUS_LABELS)) throw new Error(`Statut de tâche invalide : ${patch.status}`);
      if (patch.priority !== undefined && !["low", "normal", "high", "urgent"].includes(patch.priority)) throw new Error("Priorité invalide.");
      return repo.update(id, patch);
    },
    remove: (id: string) => repo.remove(id),
    async updateStatus(id: string, status: string) {
      if (!(status in TASK_STATUS_LABELS)) {
        throw new Error(`Statut de tâche invalide : ${status}`);
      }
      return repo.updateStatus(id, status);
    },
    updateDueDate: (id: string, dueDate: string) => repo.updateDueDate(id, dueDate),
  };
}
