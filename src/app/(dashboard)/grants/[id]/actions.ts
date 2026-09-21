"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { claimsService } from "@/server/services/claims.service";
import { tasksService } from "@/server/services/tasks.service";
import { milestonesService } from "@/server/services/milestones.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";
import { requireOrgContext } from "@/lib/permissions";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { saveAgreementSchema } from "@/features/grants/agreementSchema";
import { GRANT_PROJECT_STATUS_LABELS } from "@/features/grants/constants";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { aiSuggestionsService } from "@/server/services/aiSuggestions.service";
import { analyzeConventionFile, hasAgreementTerms } from "@/features/conventions/analyzeConvention";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { analyzableMime, analyzeInvoiceFile, invoiceAnalysisAvailable, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";

const moneyCad = (n: number | null) => (n == null ? "montant illisible" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n));

// Convention / entente téléversée : Apex la lit et PROPOSE (fournisseurs, montant, taux, dates) ; rien n'est
// appliqué sans confirmation dans le panneau « Apex a détecté… ».
async function analyzeUploadedConvention(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: { organizationId: string; organizationUserId: string },
  grantProjectId: string,
  clientId: string,
  documentId: string,
  file: File
): Promise<string | null> {
  if (!invoiceAnalysisAvailable()) return "Document téléversé. La lecture automatique n'est pas configurée (ANTHROPIC_API_KEY).";
  const mime = analyzableMime(file.name);
  if (!mime) return "Document téléversé. Seuls les PDF et images peuvent être lus automatiquement.";
  if (file.size > MAX_INVOICE_BYTES) return "Document téléversé. Fichier trop volumineux pour la lecture automatique (4 Mo max).";
  try {
    const extraction = await analyzeConventionFile({ bytes: await file.arrayBuffer(), mime });
    if (!extraction.is_agreement) return "Document téléversé, mais il ne ressemble pas à une convention ou à une entente : aucune proposition.";
    const count = await aiSuggestionsService(supabase).createFromConvention(ctx, grantProjectId, clientId, documentId, extraction);
    if (count === 0) return "Convention lue, mais aucune information exploitable n'a été trouvée.";
    return `Convention lue : ${count} proposition(s) à confirmer dans le panneau « Apex a détecté… » ci-dessous (fournisseurs${hasAgreementTerms(extraction) ? ", montant, taux et dates" : ""}).`;
  } catch (e) {
    return `Document téléversé, mais sa lecture automatique a échoué (${formatCaughtError(e)}).`;
  }
}

async function analyzeUploadedInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  grantProjectId: string,
  documentId: string,
  file: File
): Promise<string> {
  if (!invoiceAnalysisAvailable()) return "Facture téléversée. La lecture automatique n'est pas configurée (ANTHROPIC_API_KEY) : associe-la à un fournisseur dans le tableau.";
  const mime = analyzableMime(file.name);
  if (!mime) return "Facture téléversée. Ce format ne peut pas être lu automatiquement (PDF ou image seulement) : associe-la dans le tableau.";
  if (file.size > MAX_INVOICE_BYTES) return "Facture téléversée. Fichier trop volumineux pour la lecture automatique (4 Mo max) : associe-la dans le tableau.";
  try {
    const extraction = await analyzeInvoiceFile({ bytes: await file.arrayBuffer(), mime });
    if (!extraction.is_invoice) return "Facture téléversée, mais le document ne ressemble pas à une facture : rien n'a été ajouté au tableau.";
    const r = await supplierLedgerService(supabase).recordAnalyzedInvoice(organizationId, grantProjectId, documentId, extraction);
    if (r.status === "duplicate") return `Facture téléversée. Elle semble déjà enregistrée pour ${r.supplierName} (même numéro et même total) : rien n'a été ajouté.`;
    return `Facture lue : ${r.supplierName} · ${moneyCad(r.amount)} avant taxes${extraction.invoice_date ? ` · ${extraction.invoice_date}` : ""}. Ajoutée au tableau fournisseurs${r.supplierCreated ? " (nouveau fournisseur créé)" : ""} — à vérifier.`;
  } catch (e) {
    return `Facture téléversée, mais sa lecture automatique a échoué (${formatCaughtError(e)}). Associe-la dans le tableau.`;
  }
}

export type UpdateGrantProjectStatusFormState = { error: string | null };

export async function updateGrantProjectStatusAction(
  grantProjectId: string,
  _prev: UpdateGrantProjectStatusFormState,
  formData: FormData
): Promise<UpdateGrantProjectStatusFormState> {
  const ctx = await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await grantProjectsService(supabase).updateStatus(grantProjectId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }
  await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "status_changed", title: `Statut : ${GRANT_PROJECT_STATUS_LABELS[status] ?? status}`, source: "manual" });

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/grants");
  return { error: null };
}

// ---- Documents -------------------------------------------------------------

export type UploadProjectDocumentFormState = { error: string | null; info: string | null };

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
    return { error: "Choisis un fichier.", info: null };
  }

  const supabase = await createClient();
  let uploaded: Awaited<ReturnType<ReturnType<typeof documentsService>["upload"]>>;
  try {
    uploaded = await documentsService(supabase).upload({
      organizationId: ctx.organizationId,
      clientId,
      grantProjectId,
      uploadedBy: ctx.organizationUserId,
      category,
      file,
      linkToClaimId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload", info: null };
  }

  // Une facture est lue tout de suite : émetteur, montant, date -> tableau fournisseurs. Un échec de
  // lecture ne fait JAMAIS échouer le téléversement : le document est déjà enregistré.
  let info: string | null = null;
  if (category === "invoice") info = await analyzeUploadedInvoice(supabase, ctx.organizationId, grantProjectId, uploaded.id, file);
  else if (category === "agreement") info = await analyzeUploadedConvention(supabase, ctx, grantProjectId, clientId, uploaded.id, file);
  await logDossierEvent(supabase, ctx, {
    grant_project_id: grantProjectId,
    client_id: clientId,
    kind: category === "invoice" ? "invoice_uploaded" : "document_uploaded",
    title: `Document téléversé : ${file.name}`,
    detail: info,
    source: info ? "ai" : "manual",
    ref_type: "document",
    ref_id: uploaded.id,
  });

  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null, info };
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
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000) || null;
  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "normal");
  if (!["low", "normal", "high", "urgent"].includes(priority)) return { error: "Priorité invalide." };
  const assigneeRaw = String(formData.get("assigned_to") ?? "").trim();
  const claimRaw = String(formData.get("claim_id") ?? "").trim();

  const supabase = await createClient();
  try {
    // Le responsable doit être un membre du personnel de l'organisation ; la réclamation, une de CE dossier.
    let assigned_to = ctx.organizationUserId;
    if (assigneeRaw) {
      const { data: member } = await supabase.from("organization_users").select("id").eq("id", assigneeRaw).eq("organization_id", ctx.organizationId).eq("active", true).in("role", ["admin", "employee"]).maybeSingle();
      if (!member) return { error: "Responsable invalide." };
      assigned_to = member.id;
    }
    let claim_id: string | null = null;
    if (claimRaw) {
      const owned = (await claimsService(supabase).listByProject(grantProjectId)).some((c) => c.id === claimRaw);
      if (!owned) return { error: "Réclamation introuvable dans ce dossier." };
      claim_id = claimRaw;
    }
    await tasksService(supabase).create(ctx.organizationId, {
      title,
      description,
      client_id: clientId,
      grant_project_id: grantProjectId,
      due_date,
      priority,
      assigned_to,
      ...(claim_id ? { claim_id } : {}),
    });
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, client_id: clientId, kind: "task_created", title: `Tâche créée : ${title}`, source: "manual" });
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

// ---- Fournisseurs -------------------------------------------------------------
// Alimente notamment le portail client : voir clients/[id]/page.tsx et
// portal/page.tsx. Quand supplier_client_id est renseigné (ce fournisseur EST un
// client Apex, ex. Sitegrow), les infos de facturation saisies ici deviennent
// visibles dans son portail (si un compte portail lui a été créé).

export type CreateSupplierFormState = { error: string | null };

export async function createSupplierAction(
  grantProjectId: string,
  _prev: CreateSupplierFormState,
  formData: FormData
): Promise<CreateSupplierFormState> {
  const ctx = await requireOrgContext();
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const budgetAmountRaw = String(formData.get("budget_amount") ?? "").trim();
  const budget_amount = budgetAmountRaw ? Number(budgetAmountRaw) : null;
  const billing_frequency = String(formData.get("billing_frequency") ?? "").trim() || null;
  const expectedDayRaw = String(formData.get("expected_invoice_day") ?? "").trim();
  const expected_invoice_day = expectedDayRaw ? Number(expectedDayRaw) : null;
  const invoice_description_requirements = String(formData.get("invoice_description_requirements") ?? "").trim() || null;
  const supplierClientIdRaw = formData.get("supplier_client_id");
  const supplier_client_id = typeof supplierClientIdRaw === "string" && supplierClientIdRaw.length > 0 ? supplierClientIdRaw : null;

  if (!name) {
    return { error: "Le nom du fournisseur est requis." };
  }

  const supabase = await createClient();
  try {
    await projectSuppliersService(supabase).create(ctx.organizationId, grantProjectId, {
      name,
      contact,
      budget_amount,
      billing_frequency,
      expected_invoice_day,
      invoice_description_requirements,
      supplier_client_id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}

// ---- Entente de convention ----------------------------------------------------
// Enregistrer l'entente crée les dates de réclamation (estimées à partir des dates saisies) et fait
// passer le dossier à « Approuvé — en attente de réclamation ».

export type SaveAgreementState = { error: string | null; message: string | null };

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").replace(/\s|\u00a0/g, "").replace(",", ".").replace(/\$|%/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}
function dateOrNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function saveAgreementAction(
  grantProjectId: string,
  _prev: SaveAgreementState,
  formData: FormData
): Promise<SaveAgreementState> {
  const ctx = await requireOrgContext();
  const parsed = saveAgreementSchema.safeParse({
    project_start: dateOrNull(formData.get("project_start")),
    project_end: dateOrNull(formData.get("project_end")),
    eligible_expense_period_start: dateOrNull(formData.get("eligible_expense_period_start")),
    eligible_expense_period_end: dateOrNull(formData.get("eligible_expense_period_end")),
    grant_amount: numberOrNull(formData.get("grant_amount")),
    grant_rate_percent: numberOrNull(formData.get("grant_rate_percent")),
    claim_frequency: String(formData.get("claim_frequency") ?? ""),
    special_conditions: String(formData.get("special_conditions") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide", message: null };
  }

  const supabase = await createClient();
  try {
    // Délai d'échéance de chaque DDR mensuel (jours après la fin du mois) : 15 par défaut, 0 à 90.
    const delayRaw = numberOrNull(formData.get("ddr_due_delay_days"));
    const dueDelayDays = delayRaw != null && Number.isFinite(delayRaw) ? Math.min(90, Math.max(0, Math.round(delayRaw))) : undefined;
    const result = await grantAgreementsService(supabase).saveAndSchedule(ctx.organizationId, grantProjectId, parsed.data, { dueDelayDays });
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    revalidatePath("/dashboard");
    const parts = ["Entente enregistrée."];
    if (result.monthly) {
      if (result.claimsCreated > 0) parts.push(`${result.claimsCreated} DDR mensuel(s) créé(s) du début à la fin du projet — leurs échéances sont dans l'échéancier (à ajuster si besoin).`);
      else if (result.claimsSkipped > 0) parts.push("Les DDR mensuels étaient déjà présents.");
      else parts.push("Réclamations mensuelles (DDR) : renseigne le début ET la fin du projet pour les générer.");
    }
    if (result.created > 0) parts.push(`${result.created} échéance(s) estimée(s) ajoutée(s) — à valider dans l'échéancier.`);
    else if (!result.monthly && result.skipped > 0) parts.push("Les échéances de réclamation étaient déjà présentes.");
    else if (!result.monthly && result.claimsCreated === 0) parts.push("Aucune date de réclamation n'a pu être calculée : renseigne la période d'admissibilité et/ou la fin du projet.");
    if (result.statusChanged) parts.push(`Statut du dossier : ${GRANT_PROJECT_STATUS_LABELS[result.status] ?? result.status}.`);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "agreement_saved",
      title: "Entente enregistrée",
      detail: parts.slice(1).join(" ") || null,
      source: "manual",
    });
    if (result.statusChanged) {
      await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "status_changed", title: `Statut : ${GRANT_PROJECT_STATUS_LABELS[result.status] ?? result.status}`, detail: "Changé automatiquement à l'enregistrement de l'entente.", source: "system" });
    }
    return { error: null, message: parts.join(" ") };
  } catch (e) {
    return { error: formatCaughtError(e), message: null };
  }
}
