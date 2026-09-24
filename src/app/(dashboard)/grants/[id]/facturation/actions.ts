"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { logDossierEvent } from "@/server/services/audit";
import { analyzeConventionActivities } from "@/features/billing/analyzeConventionActivities";
import { analyzableMime, invoiceAnalysisAvailable, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";

export type BillingActionResult = { error: string | null; ok?: boolean; info?: string | null };

type BillingContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  project: any;
  clientName: string;
  programName: string;
  projectStart: string | null;
  projectEnd: string | null;
};

// Union discriminée par `ok` -- même précaution que src/app/(dashboard)/grants/[id]/ddr/actions.ts
// (loadDdrContext) : plus fiable qu'un `"error" in context` pour que TypeScript distingue
// correctement les deux branches.
type BillingContextResult = { ok: true; context: BillingContext } | { ok: false; error: string };

async function loadBillingContext(grantProjectId: string): Promise<BillingContextResult> {
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(grantProjectId);
  if (!project) return { ok: false, error: "Dossier introuvable." };
  const agreements = await grantAgreementsService(supabase).listByProject(grantProjectId);
  const agreement = agreements[0] ?? null;
  const projectStart = agreement?.project_start ?? project.official_start_date ?? null;
  const projectEnd = agreement?.project_end ?? project.official_end_date ?? null;
  return {
    ok: true,
    context: {
      supabase,
      project,
      clientName: project.clients?.name ?? "Client",
      programName: project.grant_programs?.name ?? "Programme",
      projectStart,
      projectEnd,
    },
  };
}

function refresh(grantProjectId: string) {
  revalidatePath(`/grants/${grantProjectId}/facturation`);
  revalidatePath(`/grants/${grantProjectId}`);
}

// Téléversement de la convention : lecture par l'IA des activités/postes budgétaires acceptés et de
// leur montant, qui REMPLACENT la liste actuelle (à valider/corriger ensuite -- rien n'est utilisé
// pour générer les versements tant que l'utilisateur n'a pas revu cette liste).
export async function analyzeBillingConventionAction(grantProjectId: string, _prev: BillingActionResult, formData: FormData): Promise<BillingActionResult> {
  const ctx = await requireOrgContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisis un fichier (PDF ou image) à téléverser." };
  if (!invoiceAnalysisAvailable()) return { error: "La lecture automatique n'est pas configurée (ANTHROPIC_API_KEY)." };
  const mime = analyzableMime(file.name);
  if (!mime) return { error: "Seuls les PDF et images peuvent être lus automatiquement." };
  if (file.size > MAX_INVOICE_BYTES) return { error: "Fichier trop volumineux pour la lecture automatique (4 Mo maximum)." };

  const supabase = await createClient();
  try {
    const activities = await analyzeConventionActivities({ bytes: await file.arrayBuffer(), mime });
    if (activities.length === 0) return { error: "Convention lue, mais aucune activité ou montant exploitable n'a été trouvé -- ajoute-les à la main ci-dessous." };
    await billingLineItemsService(supabase).replaceAll(
      ctx.organizationId,
      grantProjectId,
      // included_in_billing démarre toujours à true : la lecture automatique ne devine jamais qu'un
      // poste est un coût interne non facturé (ex. salaire) -- c'est à valider/décocher ci-dessous.
      activities.map((a) => ({ label: a.label, description: a.description, amount: a.amount ?? 0, hours: a.hours, included_in_billing: true })),
      "ai"
    );
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "billing_activities_extracted",
      title: `${activities.length} activité(s) extraite(s) de la convention pour l'aide à la facturation`,
      source: "ai",
    });
    refresh(grantProjectId);
    return { error: null, ok: true, info: `${activities.length} activité(s)/poste(s) détecté(s) -- vérifie et corrige la liste ci-dessous avant de générer les versements.` };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Édition en bloc de la liste des activités/postes budgétaires acceptés (ajout, retrait, correction
// d'un montant extrait automatiquement, ou saisie entièrement manuelle).
export async function saveBillingLineItemsAction(grantProjectId: string, _prev: BillingActionResult, formData: FormData): Promise<BillingActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const count = Number(formData.get("item_count") ?? 0);
    const items: { label: string; description: string | null; amount: number; hours: number | null; included_in_billing: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const label = String(formData.get(`item_label_${i}`) ?? "").trim();
      if (!label) continue;
      const description = textOrNull(formData.get(`item_description_${i}`), 2000);
      const amount = numberOrZero(formData.get(`item_amount_${i}`));
      const hours = numberOrNull(formData.get(`item_hours_${i}`));
      const included = formData.get(`item_included_${i}`) !== "false"; // par défaut true si absent
      items.push({ label, description, amount, hours, included_in_billing: included });
    }
    await billingLineItemsService(supabase).replaceAll(ctx.organizationId, grantProjectId, items, "manual");
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

const countSchema = z.coerce.number().int().min(1, "Au moins 1 versement.").max(36, "36 versements maximum en un lot.");

// Génération initiale du calendrier complet de versements (refuse si des versements existent déjà).
export async function generateBillingScheduleAction(grantProjectId: string, _prev: BillingActionResult, formData: FormData): Promise<BillingActionResult> {
  const ctx = await requireOrgContext();
  const parsedCount = countSchema.safeParse(formData.get("count"));
  if (!parsedCount.success) return { error: parsedCount.error.issues[0]?.message ?? "Nombre de versements invalide." };
  const count = parsedCount.data;

  const result = await loadBillingContext(grantProjectId);
  if (!result.ok) return { error: result.error };
  const context = result.context;
  if (!context.projectStart || !context.projectEnd) return { error: "Les dates de début et de fin du projet doivent être connues (entente ou dossier) avant de générer les versements." };

  try {
    await billingInstallmentsService(context.supabase).generateSchedule({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientName: context.clientName,
      programName: context.programName,
      projectName: context.project.name,
      projectStart: context.projectStart,
      projectEnd: context.projectEnd,
      count,
    });
    await logDossierEvent(context.supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "billing_schedule_generated",
      title: `Calendrier de ${count} versement(s) de facturation généré`,
      source: "ai",
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Ajuste le nombre de versements RESTANTS (le client ne facture pas à chaque période prévue) : les
// versements déjà marqués « facturé » sont préservés, le reste est régénéré à partir de la date suivante.
export async function regenerateBillingRemainingAction(grantProjectId: string, _prev: BillingActionResult, formData: FormData): Promise<BillingActionResult> {
  const ctx = await requireOrgContext();
  const parsedCount = countSchema.safeParse(formData.get("count"));
  if (!parsedCount.success) return { error: parsedCount.error.issues[0]?.message ?? "Nombre de versements invalide." };
  const count = parsedCount.data;

  const result = await loadBillingContext(grantProjectId);
  if (!result.ok) return { error: result.error };
  const context = result.context;
  if (!context.projectEnd) return { error: "La date de fin du projet doit être connue (entente ou dossier)." };

  try {
    await billingInstallmentsService(context.supabase).regenerateRemaining({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientName: context.clientName,
      programName: context.programName,
      projectName: context.project.name,
      projectEnd: context.projectEnd,
      newRemainingCount: count,
    });
    await logDossierEvent(context.supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "billing_schedule_adjusted",
      title: `Calendrier des versements restants ajusté (${count} restant(s))`,
      source: "manual",
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Édition d'un versement : texte de facture et montant restent librement modifiables, y compris ce
// qui a été rédigé/réparti automatiquement.
export async function updateBillingInstallmentAction(grantProjectId: string, installmentId: string, _prev: BillingActionResult, formData: FormData): Promise<BillingActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    await billingInstallmentsService(supabase).update(installmentId, {
      invoice_description: textOrNull(formData.get("invoice_description"), 4000),
      amount: numberOrZero(formData.get("amount")),
    });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Marque/démarque un versement comme réellement facturé -- un versement « submitted » est préservé
// tel quel par « Ajuster les versements restants » (voir billingInstallments.service.ts).
export async function setBillingInstallmentStatusAction(grantProjectId: string, installmentId: string, status: "draft" | "submitted"): Promise<BillingActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    await billingInstallmentsService(supabase).update(installmentId, { status });
    refresh(grantProjectId);
    return { error: null, ok: true };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteBillingInstallmentAction(grantProjectId: string, installmentId: string, installmentNumber: number): Promise<BillingActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const removed = await billingInstallmentsService(supabase).remove(installmentId);
    if (removed === 0) return { error: "Suppression refusée." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "billing_installment_deleted", title: `Versement de facturation n°${installmentNumber} supprimé`, source: "manual" });
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
function numberOrZero(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
