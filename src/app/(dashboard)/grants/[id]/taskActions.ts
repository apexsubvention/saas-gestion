"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { tasksService } from "@/server/services/tasks.service";
import { logDossierEvent } from "@/server/services/audit";
import { notifyUser } from "@/server/services/notifications.service";
import { TASK_STATUS_LABELS } from "@/features/grants/constants";
import { resolveTaskTarget } from "./taskTargetResolve";

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
  // 0069 -- clé "target_kind:valeur" (voir taskTargetOptions.ts) + visibilité portail.
  // Facultatifs : une tâche modifiée depuis un contexte qui ne les expose pas (ex. anciens
  // appels) garde son attribution actuelle inchangée.
  target: z.string().optional(),
  visible_in_portal: z.boolean().optional(),
});
export type TaskEditInput = z.input<typeof taskSchema>;

// Modifier une tâche : titre, description, échéance, priorité, statut, responsable (réassignation),
// attribution (0069).
export async function updateTaskDetailsAction(grantProjectId: string, input: TaskEditInput): Promise<TaskActionResult> {
  const ctx = await requireOrgContext();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const { id, target: targetRaw, visible_in_portal: visiblePortalRaw, ...fields } = parsed.data;

  const supabase = await createClient();
  const service = tasksService(supabase);
  try {
    const before = (await service.listByProject(grantProjectId)).find((t) => t.id === id);
    if (!before) return { error: "Tâche introuvable dans ce dossier." };
    if (fields.assigned_to) {
      const { data: member } = await supabase.from("organization_users").select("id").eq("id", fields.assigned_to).eq("organization_id", ctx.organizationId).eq("active", true).in("role", ["admin", "employee"]).maybeSingle();
      if (!member) return { error: "Responsable invalide." };
    }
    // 0069 -- resolveTaskTarget vérifie la cible choisie contre le VRAI client du DOSSIER (pour
    // que "client parent"/"client enfant" restent relatifs au bon client), pas contre le client
    // déjà attribué à cette tâche (qui peut déjà être un parent/enfant/fournisseur différent).
    let targetPatch: { client_id: string | null; target_kind: string; supplier_id: string | null; visible_in_portal: boolean } = {
      client_id: before.client_id,
      target_kind: before.target_kind,
      supplier_id: before.supplier_id,
      visible_in_portal: before.visible_in_portal,
    };
    if (targetRaw) {
      const { data: project } = await supabase.from("grant_projects").select("client_id").eq("id", grantProjectId).maybeSingle();
      if (!project) return { error: "Dossier introuvable." };
      const target = await resolveTaskTarget(supabase, { grantProjectId, dossierClientId: project.client_id, targetRaw });
      if ("error" in target) return { error: target.error };
      targetPatch = {
        client_id: target.client_id,
        target_kind: target.target_kind,
        supplier_id: target.supplier_id,
        visible_in_portal: Boolean(visiblePortalRaw) && target.hasPortalAccess,
      };
    } else if (visiblePortalRaw !== undefined) {
      targetPatch.visible_in_portal = Boolean(visiblePortalRaw) && targetPatch.target_kind !== "supplier";
    }

    await service.update(id, { ...fields, ...targetPatch });

    const changes: string[] = [];
    if (before.assigned_to !== fields.assigned_to) changes.push("réassignée");
    if (before.status !== fields.status) changes.push(`statut : ${TASK_STATUS_LABELS[fields.status] ?? fields.status}`);
    if ((before.due_date ?? null) !== fields.due_date) changes.push("échéance modifiée");
    if (before.priority !== fields.priority) changes.push("priorité modifiée");
    if (before.target_kind !== targetPatch.target_kind || before.client_id !== targetPatch.client_id || before.supplier_id !== targetPatch.supplier_id) {
      changes.push("attribution modifiée");
    }
    if (before.assigned_to !== fields.assigned_to) {
      await notifyUser(supabase, ctx, { userId: fields.assigned_to, type: "task_assigned", message: `Une tâche t'a été assignée : ${fields.title}`, href: `/grants/${grantProjectId}?tab=echeancier`, entity_type: "task", entity_id: id });
    }
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
