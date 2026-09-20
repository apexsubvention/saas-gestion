"use server";

// Actions déclenchées par la vue Kanban de l'échéancier (glisser-déposer) -- voir
// KanbanBoard.tsx. Le composant client connaît déjà le kind/statut/bucket courant de
// la carte déplacée (il vient de la construire via buildScheduleRows), donc ces
// actions restent de simples dispatchs vers les services existants plutôt que de
// redupliquer la logique de statut ailleurs.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { claimsService } from "@/server/services/claims.service";
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
