"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { grantProjectObjectivesService } from "@/server/services/grantProjectObjectives.service";
import { ddrReportsService } from "@/server/services/ddrReports.service";
import { logDossierEvent } from "@/server/services/audit";

export type DdrActionResult = { error: string | null; ok?: boolean };

async function loadDdrContext(grantProjectId: string) {
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(grantProjectId);
  if (!project) return { error: "Dossier introuvable." as const };
  const agreements = await grantAgreementsService(supabase).listByProject(grantProjectId);
  const agreement = agreements[0] ?? null;
  const projectStart = agreement?.project_start ?? project.official_start_date ?? null;
  const projectEnd = agreement?.project_end ?? project.official_end_date ?? null;
  return {
    supabase,
    project,
    clientName: project.clients?.name ?? "Client",
    programName: project.grant_programs?.name ?? "Programme",
    projectStart,
    projectEnd,
  };
}

function refresh(grantProjectId: string) {
  revalidatePath(`/grants/${grantProjectId}/ddr`);
  revalidatePath(`/grants/${grantProjectId}`);
}

// Objectifs du projet : liste remplacée en bloc (un objectif par ligne dans le formulaire).
export async function saveObjectivesAction(grantProjectId: string, _prev: DdrActionResult, formData: FormData): Promise<DdrActionResult> {
  const ctx = await requireOrgContext();
  const raw = String(formData.get("objectives") ?? "");
  const labels = raw.split("\n");
  const supabase = await createClient();
  try {
    await grantProjectObjectivesService(supabase).replaceAll(ctx.organizationId, grantProjectId, labels);
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Numéro de projet attribué par le bailleur de fonds (ex. numéro de projet PARI-CNRC).
export async function saveExternalProjectNumberAction(grantProjectId: string, _prev: DdrActionResult, formData: FormData): Promise<DdrActionResult> {
  await requireOrgContext();
  const value = String(formData.get("external_project_number") ?? "").trim().slice(0, 100) || null;
  const supabase = await createClient();
  try {
    const { error } = await supabase.from("grant_projects").update({ external_project_number: value }).eq("id", grantProjectId);
    if (error) throw error;
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

const countSchema = z.coerce.number().int().min(1, "Au moins 1 DDR.").max(24, "24 DDR maximum en un lot.");

// Génération initiale du calendrier complet de DDR (refuse si des DDR existent déjà).
export async function generateDdrScheduleAction(grantProjectId: string, _prev: DdrActionResult, formData: FormData): Promise<DdrActionResult> {
  const ctx = await requireOrgContext();
  const parsedCount = countSchema.safeParse(formData.get("count"));
  if (!parsedCount.success) return { error: parsedCount.error.issues[0]?.message ?? "Nombre de DDR invalide." };

  const context = await loadDdrContext(grantProjectId);
  if ("error" in context) return { error: context.error };
  if (!context.projectStart || !context.projectEnd) return { error: "Les dates de début et de fin du projet doivent être connues (entente ou dossier) avant de générer les DDR." };

  try {
    await ddrReportsService(context.supabase).generateSchedule({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientName: context.clientName,
      programName: context.programName,
      projectName: context.project.name,
      externalProjectNumber: context.project.external_project_number ?? null,
      projectContext: context.project.description ?? null,
      projectStart: context.projectStart,
      projectEnd: context.projectEnd,
      count: parsedCount.data,
    });
    await logDossierEvent(context.supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "ddr_schedule_generated",
      title: `Calendrier de ${parsedCount.data} DDR généré`,
      source: "ai",
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Ajuste le nombre de DDR restants (l'entreprise ne dépose pas à chaque période prévue) : les DDR
// déjà marqués « déposé » sont préservés, le reste est régénéré à partir de la date suivante.
export async function regenerateDdrRemainingAction(grantProjectId: string, _prev: DdrActionResult, formData: FormData): Promise<DdrActionResult> {
  const ctx = await requireOrgContext();
  const parsedCount = countSchema.safeParse(formData.get("count"));
  if (!parsedCount.success) return { error: parsedCount.error.issues[0]?.message ?? "Nombre de DDR invalide." };

  const context = await loadDdrContext(grantProjectId);
  if ("error" in context) return { error: context.error };
  if (!context.projectEnd) return { error: "La date de fin du projet doit être connue (entente ou dossier)." };

  try {
    await ddrReportsService(context.supabase).regenerateRemaining({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientName: context.clientName,
      programName: context.programName,
      projectName: context.project.name,
      externalProjectNumber: context.project.external_project_number ?? null,
      projectContext: context.project.description ?? null,
      projectEnd: context.projectEnd,
      newRemainingCount: parsedCount.data,
    });
    await logDossierEvent(context.supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "ddr_schedule_adjusted",
      title: `Calendrier des DDR restants ajusté (${parsedCount.data} DDR restant(s))`,
      source: "manual",
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Édition d'un DDR : champs d'entête + texte de chaque section, y compris le narratif et le %
// d'avancement de chaque objectif (index par position, l'ordre de objectives_snapshot est fixé à
// la génération). Tout reste modifiable, y compris ce qui a été rédigé automatiquement.
export async function updateDdrReportAction(grantProjectId: string, reportId: string, _prev: DdrActionResult, formData: FormData): Promise<DdrActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const service = ddrReportsService(supabase);
    const existing = (await service.listByProject(grantProjectId)).find((r) => r.id === reportId);
    if (!existing) return { error: "DDR introuvable dans ce dossier." };

    const objectivesSnapshot = existing.objectives_snapshot.map((o, i) => ({
      ...o,
      progress_percent: numberOrNull(formData.get(`objective_progress_${i}`)) ?? o.progress_percent,
      narrative: (formData.get(`objective_narrative_${i}`) ?? o.narrative).toString().slice(0, 3000),
    }));

    await service.update(reportId, {
      on_schedule: formData.get("on_schedule") === "on",
      delay_justification: textOrNull(formData.get("delay_justification"), 2000),
      new_end_date: textOrNull(formData.get("new_end_date"), 20),
      address_changed: formData.get("address_changed") === "on",
      company_name_changed: formData.get("company_name_changed") === "on",
      activities_text: textOrNull(formData.get("activities_text"), 8000),
      variations_text: textOrNull(formData.get("variations_text"), 4000),
      objectives_snapshot: objectivesSnapshot,
      prepared_by_name: textOrNull(formData.get("prepared_by_name"), 200),
      prepared_by_title: textOrNull(formData.get("prepared_by_title"), 200),
      signature_date: textOrNull(formData.get("signature_date"), 20),
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Marque/démarque un DDR comme réellement déposé -- un DDR « submitted » est préservé tel quel par
// « Ajuster le nombre de DDR restants » (voir ddrReports.service.ts).
export async function setDdrStatusAction(grantProjectId: string, reportId: string, status: "draft" | "submitted"): Promise<DdrActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    await ddrReportsService(supabase).update(reportId, { status });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteDdrReportAction(grantProjectId: string, reportId: string): Promise<DdrActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const service = ddrReportsService(supabase);
    const existing = (await service.listByProject(grantProjectId)).find((r) => r.id === reportId);
    if (!existing) return { error: "DDR introuvable dans ce dossier." };
    const removed = await service.remove(reportId);
    if (removed === 0) return { error: "Suppression refusée." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "ddr_deleted", title: `DDR ${existing.ddr_number} supprimé`, source: "manual" });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

function textOrNull(v: FormDataEntryValue | null, max: number): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s.slice(0, max) : null;
}
function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}
