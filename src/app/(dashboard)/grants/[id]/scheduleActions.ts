"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { milestonesService } from "@/server/services/milestones.service";
import { claimsService } from "@/server/services/claims.service";
import { scheduleDismissalsService } from "@/server/services/scheduleDismissals.service";
import { logAudit, logDossierEvent } from "@/server/services/audit";
import { isAutoClaimNumber, isAutoMilestone, milestoneDedupeKey, MILESTONE_TYPE_LABELS } from "@/features/schedule/dismissals";
import { deleteTaskAction } from "./taskActions";

export type ScheduleActionResult = { error: string | null };
export type CreateMilestoneFormState = { error: string | null; savedAt?: number };

function refresh(grantProjectId: string) {
  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/echeancier");
  revalidatePath("/taches");
}

const uuid = z.string().uuid();

// Supprimer un élément de l'échéancier : tâche, échéance ou réclamation. L'élément doit appartenir à CE dossier.
// Un élément créé automatiquement (DDR mensuel, échéance suggérée par l'entente) est mémorisé comme supprimé :
// réenregistrer l'entente ne le recrée pas.
export async function deleteScheduleItemAction(grantProjectId: string, kind: "task" | "milestone" | "claim", id: string): Promise<ScheduleActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(grantProjectId).success || !uuid.safeParse(id).success) return { error: "Élément invalide." };
  if (kind === "task") return deleteTaskAction(grantProjectId, id);

  const supabase = await createClient();
  const dismissals = scheduleDismissalsService(supabase);
  try {
    if (kind === "milestone") {
      const service = milestonesService(supabase);
      const before = (await service.listByProject(grantProjectId)).find((m) => m.id === id);
      if (!before) return { error: "Échéance introuvable dans ce dossier." };
      const removed = await service.remove(id);
      if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
      if (isAutoMilestone(before.source)) await dismissals.add(ctx, grantProjectId, "milestone", milestoneDedupeKey(before.type, before.title));
      await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "milestone_deleted", title: `Échéance supprimée : ${before.title}`, detail: before.internal_due_date ? `Date : ${before.internal_due_date}` : null, source: "manual" });
      refresh(grantProjectId);
      return { error: null };
    }

    const service = claimsService(supabase);
    const before = (await service.listByProject(grantProjectId)).find((c) => c.id === id);
    if (!before) return { error: "Réclamation introuvable dans ce dossier." };
    const removed = await service.remove(id);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    if (isAutoClaimNumber(before.claim_number)) await dismissals.add(ctx, grantProjectId, "claim", before.claim_number);
    const label = before.claim_number || "Réclamation";
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "claim_deleted", title: `Réclamation supprimée : ${label}`, detail: `Statut : ${before.status}${before.claimed_amount != null ? ` · montant réclamé ${before.claimed_amount} $` : ""}`, source: "manual" });
    await logAudit(supabase, ctx, { action: "claim_deleted", entity_type: "claim", entity_id: id, before });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").refine((s) => !Number.isNaN(Date.parse(s)), "Date invalide");
const milestoneSchema = z.object({
  title: z.string().trim().min(1, "Le titre de l'échéance est requis.").max(200, "Titre trop long (200 caractères max)."),
  type: z.string().refine((t) => t in MILESTONE_TYPE_LABELS, "Type d'échéance invalide."),
  date: isoDate,
});

// Ajouter une échéance manuelle (en plus de celles suggérées à partir de l'entente).
export async function createMilestoneAction(grantProjectId: string, _prev: CreateMilestoneFormState, formData: FormData): Promise<CreateMilestoneFormState> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(grantProjectId).success) return { error: "Dossier invalide." };
  const parsed = milestoneSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? "other"),
    date: String(formData.get("date") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  try {
    const created = await milestonesService(supabase).create({
      organization_id: ctx.organizationId,
      grant_project_id: grantProjectId,
      type: parsed.data.type,
      title: parsed.data.title,
      internal_due_date: parsed.data.date,
      source: "manual",
    });
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "milestone_created", title: `Échéance ajoutée : ${parsed.data.title}`, detail: `Date : ${parsed.data.date}`, source: "manual", ref_type: "milestone", ref_id: created.id });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  refresh(grantProjectId);
  return { error: null, savedAt: Date.now() };
}
