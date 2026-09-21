"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { tasksService } from "@/server/services/tasks.service";
import { logDossierEvent } from "@/server/services/audit";
import { TASK_STATUS_LABELS } from "@/features/grants/constants";

export type TaskActionResult = { error: string | null };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").refine((s) => !Number.isNaN(Date.parse(s)), "Date invalide").nullable();
const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Le titre de la tâche est requis.").max(300),
  description: z.string().trim().max(2000).nullable().transform((v) => v || null),
  due_date: isoDate,
  priority: z.enum(["low", "normal", "high", "urgent"], { errorMap: () => ({ message: "Priorité invalide." }) }),
  status: z.string().refine((s) => s in TASK_STATUS_LABELS, "Statut invalide."),
  assigned_to: z.string().uuid().nullable(),
});
export type TaskEditInput = z.input<typeof taskSchema>;

// Modifier une tâche : titre, description, échéance, priorité, statut, responsable (réassignation).
export async function updateTaskDetailsAction(grantProjectId: string, input: TaskEditInput): Promise<TaskActionResult> {
  const ctx = await requireOrgContext();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  const service = tasksService(supabase);
  try {
    const before = (await service.listByProject(grantProjectId)).find((t) => t.id === id);
    if (!before) return { error: "Tâche introuvable dans ce dossier." };
    if (fields.assigned_to) {
      const { data: member } = await supabase.from("organization_users").select("id").eq("id", fields.assigned_to).eq("organization_id", ctx.organizationId).eq("active", true).in("role", ["admin", "employee"]).maybeSingle();
      if (!member) return { error: "Responsable invalide." };
    }
    await service.update(id, fields);

    const changes: string[] = [];
    if (before.assigned_to !== fields.assigned_to) changes.push("réassignée");
    if (before.status !== fields.status) changes.push(`statut : ${TASK_STATUS_LABELS[fields.status] ?? fields.status}`);
    if ((before.due_date ?? null) !== fields.due_date) changes.push("échéance modifiée");
    if (before.priority !== fields.priority) changes.push("priorité modifiée");
    if (changes.length > 0) {
      await logDossierEvent(supabase, ctx, {
        grant_project_id: grantProjectId,
        kind: fields.status === "done" && before.status !== "done" ? "task_completed" : "task_updated",
        title: `${fields.status === "done" && before.status !== "done" ? "Tâche terminée" : "Tâche modifiée"} : ${fields.title}`,
        detail: changes.join(" · "),
        source: "manual",
        ref_type: "task",
        ref_id: id,
      });
    }
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    revalidatePath("/taches");
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteTaskAction(grantProjectId: string, taskId: string): Promise<TaskActionResult> {
  const ctx = await requireOrgContext();
  if (!z.string().uuid().safeParse(taskId).success) return { error: "Tâche invalide." };
  const supabase = await createClient();
  const service = tasksService(supabase);
  try {
    const before = (await service.listByProject(grantProjectId)).find((t) => t.id === taskId);
    if (!before) return { error: "Tâche introuvable dans ce dossier." };
    const removed = await service.remove(taskId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "task_deleted", title: `Tâche supprimée : ${before.title}`, source: "manual" });
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    revalidatePath("/taches");
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Depuis la vue globale « Mes tâches » : marquer terminée (formulaire simple, sans état).
export async function completeTaskAction(formData: FormData): Promise<void> {
  await requireOrgContext();
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await tasksService(supabase).updateStatus(id, "done");
  revalidatePath("/taches");
  revalidatePath("/echeancier");
}
