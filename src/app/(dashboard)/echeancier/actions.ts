"use server";

// Actions déclenchées par la vue Kanban de l'échéancier (glisser-déposer) -- voir
// KanbanBoard.tsx. Le composant client connaît déjà le kind/statut/bucket courant de
// la carte déplacée (il vient de la construire via buildScheduleRows), donc ces
// actions restent de simples dispatchs vers les services existants plutôt que de
// redupliquer la logique de statut ailleurs.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { claimsService } from "@/server/services/claims.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { logDossierEvent } from "@/server/services/audit";
import { representativeDateForBucket, type PriorityBucket } from "@/features/schedule/priority";

export type ScheduleEntryKind = "task" | "milestone" | "claim";

// Statut "actif" repris par défaut si on ressort une carte du seau "Terminé" en la
// glissant vers une colonne de date -- reprend le statut par défaut de chaque table
// (voir migrations 0005_agreements_milestones.sql, 0006_suppliers_budget_tasks.sql,
// 0008_expenses_claims.sql).
const DEFAULT_ACTIVE_STATUS: Record<ScheduleEntryKind, string> = {
  task: "todo",
  milestone: "pending",
  claim: "planned",
};

// Statut terminal appliqué en déposant une carte dans la colonne "Terminé". Pour une
// réclamation, 'paid' est un choix par défaut (cas le plus fréquent d'un dossier qui
// se conclut normalement) -- correctible ensuite via le sélecteur de statut existant
// sur la fiche dossier si ce n'est pas le bon statut terminal (ex. 'rejected').
const DONE_STATUS: Record<ScheduleEntryKind, string> = {
  task: "done",
  milestone: "done",
  claim: "paid",
};

async function assertStaffAndGetClient() {
  await requireOrgContext();
  return createClient();
}

export async function markScheduleEntryDoneAction(kind: ScheduleEntryKind, id: string): Promise<void> {
  const supabase = await assertStaffAndGetClient();

  if (kind === "task") {
    await tasksService(supabase).updateStatus(id, DONE_STATUS.task);
  } else if (kind === "milestone") {
    await milestonesService(supabase).updateStatus(id, DONE_STATUS.milestone);
  } else {
    await claimsService(supabase).updateStatus(id, DONE_STATUS.claim);
  }

  revalidatePath("/echeancier");
}

export type GlobalTaskActionResult = { error: string | null; id?: string };

const NOTE_MAX = 2000;
const TITLE_MAX = 120;

function titleFromNote(note: string): string {
  return note.length > TITLE_MAX ? `${note.slice(0, TITLE_MAX - 1)}…` : note;
}

// Ajout manuel d'une tâche depuis l'échéancier global (pas depuis un dossier précis) : client
// obligatoire, dossier facultatif (filtré au client choisi côté formulaire), note obligatoire.
// La note devient la description complète de la tâche ; son titre (utilisé dans les cartes/tableaux)
// en est un résumé tronqué. Passe par le même tasksService que partout ailleurs, donc apparaît
// automatiquement partout où l'échéancier est construit (buildScheduleRows) -- vues Priorités/
// Kanban/Liste ici, et dans la fiche du dossier si un dossier a été choisi.
export async function createGlobalTaskAction(_prev: GlobalTaskActionResult, formData: FormData): Promise<GlobalTaskActionResult> {
  const ctx = await requireOrgContext();

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!z.string().uuid().safeParse(clientId).success) return { error: "Sélectionne un client." };
  const grantProjectIdRaw = String(formData.get("grant_project_id") ?? "").trim();
  const grantProjectId = grantProjectIdRaw ? grantProjectIdRaw : null;
  if (grantProjectId && !z.string().uuid().safeParse(grantProjectId).success) return { error: "Dossier invalide." };
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "La note est requise." };
  if (note.length > NOTE_MAX) return { error: `Note trop longue (${NOTE_MAX} caractères maximum).` };

  const supabase = await createClient();
  try {
    const { data: clientRow } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client introuvable." };

    if (grantProjectId) {
      const projects = await grantProjectsService(supabase).listByClient(clientId);
      if (!(projects ?? []).some((p: any) => p.id === grantProjectId)) return { error: "Ce dossier n'appartient pas au client sélectionné." };
    }

    const title = titleFromNote(note);
    const created = await tasksService(supabase).create(ctx.organizationId, {
      title,
      description: note,
      client_id: clientId,
      grant_project_id: grantProjectId,
      assigned_to: ctx.organizationUserId,
    });

    if (grantProjectId) {
      await logDossierEvent(supabase, ctx, {
        grant_project_id: grantProjectId,
        client_id: clientId,
        kind: "task_created",
        title: `Tâche ajoutée : ${title}`,
        source: "manual",
        ref_type: "task",
        ref_id: created.id,
      });
    }

    revalidatePath("/echeancier");
    revalidatePath("/taches");
    if (grantProjectId) revalidatePath(`/grants/${grantProjectId}`);
    return { error: null, id: created.id };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Suppression manuelle d'une tâche depuis l'échéancier global -- réservée aux tâches (les échéances
// et réclamations générées automatiquement restent supprimables depuis la fiche du dossier, où le
// mécanisme schedule_dismissals évite qu'elles ne réapparaissent).
export async function deleteGlobalTaskAction(taskId: string): Promise<GlobalTaskActionResult> {
  const ctx = await requireOrgContext();
  if (!z.string().uuid().safeParse(taskId).success) return { error: "Tâche invalide." };
  const supabase = await createClient();
  try {
    const { data: before } = await supabase.from("tasks").select("id, title, client_id, grant_project_id").eq("id", taskId).maybeSingle();
    if (!before) return { error: "Tâche introuvable." };
    const removed = await tasksService(supabase).remove(taskId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à cette tâche." };
    if (before.grant_project_id) {
      await logDossierEvent(supabase, ctx, { grant_project_id: before.grant_project_id, kind: "task_deleted", title: `Tâche supprimée : ${before.title}`, source: "manual" });
    }
    revalidatePath("/echeancier");
    revalidatePath("/taches");
    if (before.grant_project_id) revalidatePath(`/grants/${before.grant_project_id}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function rescheduleScheduleEntryAction(
  kind: ScheduleEntryKind,
  id: string,
  targetBucket: Exclude<PriorityBucket, "done" | "no_date">,
  wasTerminal: boolean
): Promise<void> {
  const supabase = await assertStaffAndGetClient();
  const date = representativeDateForBucket(targetBucket);

  if (kind === "task") {
    await tasksService(supabase).updateDueDate(id, date);
    if (wasTerminal) await tasksService(supabase).updateStatus(id, DEFAULT_ACTIVE_STATUS.task);
  } else if (kind === "milestone") {
    await milestonesService(supabase).updateDueDate(id, date);
    if (wasTerminal) await milestonesService(supabase).updateStatus(id, DEFAULT_ACTIVE_STATUS.milestone);
  } else {
    await claimsService(supabase).updateDueDate(id, date);
    if (wasTerminal) await claimsService(supabase).updateStatus(id, DEFAULT_ACTIVE_STATUS.claim);
  }

  revalidatePath("/echeancier");
}
