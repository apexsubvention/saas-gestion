import type { SupabaseClient } from "@supabase/supabase-js";
import { tasksRepository, type TaskTargetKind } from "@/server/repositories/tasks.repository";
import { TASK_STATUS_LABELS } from "@/features/grants/constants";

const TASK_TARGET_KINDS: TaskTargetKind[] = ["client", "parent_client", "child_client", "supplier"];

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
        // 0069 -- à qui la tâche est attribuée (client du dossier / parent / enfant / fournisseur
        // inscrit) et si elle doit apparaître dans son portail. target_kind par défaut 'client' :
        // comportement identique à avant 0069 quand on ne les précise pas.
        target_kind?: TaskTargetKind;
        supplier_id?: string | null;
        visible_in_portal?: boolean;
      }
    ) {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Le titre de la tâche est requis.");
      }
      if (!input.client_id && !input.grant_project_id) {
        throw new Error("Une tâche doit être rattachée à un client ou à un dossier.");
      }
      const targetKind: TaskTargetKind = input.target_kind ?? "client";
      if (!TASK_TARGET_KINDS.includes(targetKind)) {
        throw new Error("Attribution de tâche invalide.");
      }
      if (targetKind === "supplier" && !input.supplier_id) {
        throw new Error("Choisis le fournisseur à qui attribuer cette tâche.");
      }
      if (targetKind !== "supplier" && !input.client_id) {
        throw new Error("Choisis le client à qui attribuer cette tâche.");
      }
      if (input.visible_in_portal && targetKind === "supplier" && !input.supplier_id) {
        throw new Error("Un fournisseur est requis pour rendre cette tâche visible dans son portail.");
      }
      return repo.create({ organization_id: organizationId, ...input, target_kind: targetKind });
    },
    async update(
      id: string,
      patch: {
        title?: string;
        description?: string | null;
        due_date?: string | null;
        priority?: string;
        status?: string;
        assigned_to?: string | null;
        client_id?: string | null;
        target_kind?: TaskTargetKind;
        supplier_id?: string | null;
        visible_in_portal?: boolean;
      }
    ) {
      if (patch.title !== undefined && patch.title.trim().length === 0) throw new Error("Le titre de la tâche est requis.");
      if (patch.status !== undefined && !(patch.status in TASK_STATUS_LABELS)) throw new Error(`Statut de tâche invalide : ${patch.status}`);
      if (patch.priority !== undefined && !["low", "normal", "high", "urgent"].includes(patch.priority)) throw new Error("Priorité invalide.");
      if (patch.target_kind !== undefined && !TASK_TARGET_KINDS.includes(patch.target_kind)) {
        throw new Error("Attribution de tâche invalide.");
      }
      if (patch.target_kind === "supplier" && !patch.supplier_id) {
        throw new Error("Choisis le fournisseur à qui attribuer cette tâche.");
      }
      if (patch.target_kind !== undefined && patch.target_kind !== "supplier" && !patch.client_id) {
        throw new Error("Choisis le client à qui attribuer cette tâche.");
      }
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
