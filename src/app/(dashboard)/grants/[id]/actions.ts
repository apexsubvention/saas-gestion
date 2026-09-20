"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { claimsService } from "@/server/services/claims.service";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";
import { requireOrgContext } from "@/lib/permissions";

export type UpdateGrantProjectStatusFormState = { error: string | null };

export async function updateGrantProjectStatusAction(
  grantProjectId: string,
  _prev: UpdateGrantProjectStatusFormState,
  formData: FormData
): Promise<UpdateGrantProjectStatusFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await grantProjectsService(supabase).updateStatus(grantProjectId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/grants");
  return { error: null };
}

// ---- Documents -------------------------------------------------------------

export type UploadProjectDocumentFormState = { error: string | null };

export async function uploadProjectDocumentAction(
  grantProjectId: string,
  clientId: string,
  _prev: UploadProjectDocumentFormState,
  formData: FormData
): Promise<UploadProjectDocumentFormState> {
  const ctx = await requireOrgContext();
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "other");
  const linkToClaimIdRaw = formData.get("claim_id");
  const linkToClaimId = typeof linkToClaimIdRaw === "string" && linkToClaimIdRaw.length > 0 ? linkToClaimIdRaw : null;

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  try {
    await documentsService(supabase).upload({
      organizationId: ctx.organizationId,
      clientId,
      grantProjectId,
      uploadedBy: ctx.organizationUserId,
      category,
      file,
      linkToClaimId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}

// Retourne une URL signée de courte durée pour visualiser/télécharger un document.
// Générée à la demande (jamais embarquée dans le HTML de la page) : elle expire vite
// et le bucket est privé, donc pas d'autre moyen d'y accéder.
export async function getDocumentUrlAction(storagePath: string): Promise<{ url: string | null; error: string | null }> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const url = await documentsService(supabase).getSignedUrl(storagePath, 300);
    return { url, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Erreur lors de la génération du lien" };
  }
}

// ---- Réclamations ------------------------------------------------------------

export type CreateClaimFormState = { error: string | null };

export async function createClaimAction(
  grantProjectId: string,
  _prev: CreateClaimFormState,
  formData: FormData
): Promise<CreateClaimFormState> {
  const ctx = await requireOrgContext();
  const claim_number = String(formData.get("claim_number") ?? "").trim() || null;
  const period_start = String(formData.get("period_start") ?? "").trim() || null;
  const period_end = String(formData.get("period_end") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "").trim() || null;

  const supabase = await createClient();
  try {
    await claimsService(supabase).create(ctx.organizationId, grantProjectId, {
      claim_number,
      period_start,
      period_end,
      due_date,
      status: "planned",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  return { error: null };
}

export type UpdateClaimStatusFormState = { error: string | null };

export async function updateClaimStatusAction(
  grantProjectId: string,
  claimId: string,
  _prev: UpdateClaimStatusFormState,
  formData: FormData
): Promise<UpdateClaimStatusFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await claimsService(supabase).updateStatus(claimId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  return { error: null };
}

// ---- Tâches -----------------------------------------------------------------

export type CreateTaskFormState = { error: string | null };

export async function createTaskAction(
  grantProjectId: string,
  clientId: string,
  _prev: CreateTaskFormState,
  formData: FormData
): Promise<CreateTaskFormState> {
  const ctx = await requireOrgContext();
  const title = String(formData.get("title") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "normal");

  const supabase = await createClient();
  try {
    await tasksService(supabase).create(ctx.organizationId, {
      title,
      client_id: clientId,
      grant_project_id: grantProjectId,
      due_date,
      priority,
      assigned_to: ctx.organizationUserId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  return { error: null };
}

export type UpdateTaskStatusFormState = { error: string | null };

export async function updateTaskStatusAction(
  grantProjectId: string,
  taskId: string,
  _prev: UpdateTaskStatusFormState,
  formData: FormData
): Promise<UpdateTaskStatusFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await tasksService(supabase).updateStatus(taskId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  return { error: null };
}

// ---- Échéancier (milestones) -------------------------------------------------
// Voir src/server/scheduling/suggestMilestones.ts pour la logique et pourquoi ces
// dates sont toujours des SUGGESTIONS à valider, jamais des échéances officielles.

export type UpdateMilestoneStatusFormState = { error: string | null };

export async function updateMilestoneStatusAction(
  grantProjectId: string,
  milestoneId: string,
  _prev: UpdateMilestoneStatusFormState,
  formData: FormData
): Promise<UpdateMilestoneStatusFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await milestonesService(supabase).updateStatus(milestoneId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  return { error: null };
}

export async function deleteMilestoneAction(grantProjectId: string, milestoneId: string): Promise<void> {
  await requireOrgContext();
  const supabase = await createClient();
  await milestonesService(supabase).remove(milestoneId);
  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
}

export type SuggestMilestonesState = { error: string | null; created: number; skipped: number };

export async function suggestMilestonesAction(
  grantProjectId: string,
  _prev: SuggestMilestonesState,
  _formData: FormData
): Promise<SuggestMilestonesState> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();

  try {
    const agreements = await grantAgreementsRepository(supabase).listByProject(grantProjectId);
    const agreement = agreements[0];
    if (!agreement) {
      return {
        error: "Aucune entente de convention enregistrée pour ce dossier — rien à estimer sans dates de projet.",
        created: 0,
        skipped: 0,
      };
    }

    const result = await milestonesService(supabase).suggestForProject(ctx.organizationId, grantProjectId, {
      eligible_expense_period_start: agreement.eligible_expense_period_start,
      eligible_expense_period_end: agreement.eligible_expense_period_end,
      project_end: agreement.project_end,
    });

    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    return { error: null, created: result.created, skipped: result.skipped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur", created: 0, skipped: 0 };
  }
}
