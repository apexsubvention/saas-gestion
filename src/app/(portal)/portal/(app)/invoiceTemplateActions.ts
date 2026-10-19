"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePortalContext, portalEditRefusal, type PortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { notifyUser } from "@/server/services/notifications.service";
import { invoiceTemplatesService, extractionFromDraft } from "@/server/services/invoiceTemplates.service";
import { portalInvoiceIntakeService } from "@/server/services/portalInvoiceIntake.service";
import { replaceInvoiceFile } from "@/server/services/invoiceReplacement.service";
import { billingInstallmentsRepository, type BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import { billingLineItemsRepository } from "@/server/repositories/billingLineItems.repository";
import { expectedShareForSupplier } from "@/features/invoices/checkInstallmentInvoice";
import { prepareInvoiceTemplate } from "@/features/invoices/prepareInvoiceTemplate";
import { addDays, generatedInvoiceFilename, INVOICE_TEMPLATE_FIELDS, type InvoiceDraftValues } from "@/features/invoices/invoiceTemplateFields";
import { MAX_UPLOAD_BYTES } from "@/components/forms/FileInput";

// Modèle de facture d'un fournisseur (0079, Jade) : il téléverse SA facture vierge (Word) une fois ;
// pour chaque versement du plan de facturation, Apex prépare la facture (description, période,
// montant, taxes), le fournisseur inscrit son numéro et corrige au besoin les dates / l'échéance,
// puis la télécharge et/ou l'envoie comme « facture faite » du versement.

const BUCKET = "apex-documents";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const admin = () => createAdminClient() as unknown as SupabaseClient;

// ---------------------------------------------------------------- Modèle -----------------------

export type TemplateFormState = { error: string | null; message?: string | null };

export async function uploadInvoiceTemplateAction(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisis le fichier Word de ta facture vierge." };
  if (!/\.docx$/i.test(file.name)) {
    return { error: "Le modèle doit être un fichier Word (.docx). Un PDF peut être ouvert dans Word puis enregistré en .docx." };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Fichier trop volumineux : 4 Mo maximum." };

  const db = admin();
  try {
    const bytes = await file.arrayBuffer();
    const prepared = await prepareInvoiceTemplate(bytes);
    if (prepared.tags.length === 0) {
      return { error: "Apex n'a trouvé aucun endroit où écrire les informations dans ce modèle. Ajoutez les balises {{...}} listées ci-dessous dans votre fichier Word, puis téléversez-le de nouveau." };
    }

    const store = async (name: string, body: Blob | Buffer) => {
      const path = `${ctx.organizationId}/${ctx.clientId}/${Date.now()}-${name}`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, body, { contentType: DOCX_MIME, upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await db
        .from("documents")
        .insert({ organization_id: ctx.organizationId, filename: name, storage_path: path, mime_type: DOCX_MIME, size: body instanceof Blob ? body.size : body.length, category: "invoice_template", client_id: ctx.clientId, grant_project_id: null, uploaded_by: ctx.organizationUserId, source: "client_portal" })
        .select("id")
        .single();
      if (error) {
        if (/documents_category_check/.test(error.message ?? "")) throw new Error("Le modèle de facture n'est pas encore activé : la migration 0079 doit être passée dans Supabase.");
        throw error;
      }
      return (data as { id: string }).id;
    };

    const originalId = await store(file.name, file);
    const preparedId = prepared.automatic ? await store(`Modèle préparé - ${file.name}`, prepared.docx) : originalId;
    await invoiceTemplatesService(db).save({ organizationId: ctx.organizationId, clientId: ctx.clientId, documentId: preparedId, originalDocumentId: originalId, tags: prepared.tags, updatedBy: ctx.organizationUserId });

    const labels = INVOICE_TEMPLATE_FIELDS.filter((f) => prepared.tags.includes(f.tag)).map((f) => f.label.toLowerCase());
    revalidatePath("/portal/modele-facture");
    revalidatePath("/portal");
    return {
      error: null,
      message: `Modèle enregistré. ${prepared.automatic ? "Apex a repéré" : "Balises trouvées"} : ${labels.join(", ")}. Téléchargez le modèle préparé pour vérifier qu'il est bien placé.`,
    };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function downloadInvoiceTemplateAction(): Promise<{ error: string | null; filename?: string; base64?: string }> {
  const ctx = await requirePortalContext();
  const db = admin();
  const tpl = await invoiceTemplatesService(db).getForClient(ctx.clientId);
  if (!tpl) return { error: "Aucun modèle enregistré." };
  const { data: doc } = await db.from("documents").select("filename, storage_path").eq("id", tpl.document_id).maybeSingle();
  const d = doc as { filename: string; storage_path: string } | null;
  if (!d) return { error: "Modèle introuvable." };
  const { data: blob, error } = await db.storage.from(BUCKET).download(d.storage_path);
  if (error || !blob) return { error: "Modèle introuvable dans le stockage." };
  return { error: null, filename: d.filename, base64: Buffer.from(await blob.arrayBuffer()).toString("base64") };
}

// ------------------------------------------------------- Facture d'un versement ----------------

type InstallmentContext = {
  installment: BillingInstallmentRow;
  projectName: string;
  projectClientId: string;
  projectClientName: string;
  ownerId: string | null;
};

// Accès vérifié avec le client RLS du portail (client, parent ou fournisseur du dossier).
async function loadInstallment(installmentId: string): Promise<InstallmentContext | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("billing_installments").select("id").eq("id", installmentId).maybeSingle();
  if (!data) return null;
  const db = admin();
  const { data: installment } = await db.from("billing_installments").select("*").eq("id", installmentId).maybeSingle();
  if (!installment) return null;
  const inst = installment as BillingInstallmentRow;
  const { data: project } = await db.from("grant_projects").select("name, client_id, owner_id, clients(name)").eq("id", inst.grant_project_id).maybeSingle();
  const p = project as unknown as { name: string; client_id: string; owner_id: string | null; clients: { name: string } | null } | null;
  if (!p) return null;
  return { installment: inst, projectName: p.name, projectClientId: p.client_id, projectClientName: p.clients?.name ?? "", ownerId: p.owner_id };
}

async function defaultAmount(ctx: PortalContext, inst: BillingInstallmentRow): Promise<number> {
  const db = admin();
  const { data: supplier } = await db.from("project_suppliers").select("id").eq("grant_project_id", inst.grant_project_id).eq("supplier_client_id", ctx.clientId).limit(1).maybeSingle();
  const supplierId = (supplier as { id: string } | null)?.id ?? null;
  const lineItems = await billingLineItemsRepository(db).listByProject(inst.grant_project_id);
  return expectedShareForSupplier(Number(inst.amount), supplierId, lineItems.map((it) => ({ supplier_id: it.supplier_id, amount: Number(it.amount), included_in_billing: it.included_in_billing }))) ?? Number(inst.amount);
}

export type InvoiceDraftView = {
  error: string | null;
  hasTemplate: boolean;
  values: InvoiceDraftValues | null;
  sentDocumentId: string | null;
};

export async function getInvoiceDraftAction(installmentId: string): Promise<InvoiceDraftView> {
  const ctx = await requirePortalContext();
  const loaded = await loadInstallment(installmentId);
  if (!loaded) return { error: "Versement introuvable ou accès refusé.", hasTemplate: false, values: null, sentDocumentId: null };
  const db = admin();
  const svc = invoiceTemplatesService(db);
  const [template, draft] = await Promise.all([svc.getForClient(ctx.clientId), svc.getDraft(installmentId, ctx.clientId)]);
  const inst = loaded.installment;

  const today = new Date().toISOString().slice(0, 10);
  const invoiceDate = draft?.invoice_date ?? (inst.period_end && inst.period_end <= today ? inst.period_end : today);
  let address = draft?.client_address ?? null;
  if (address == null) {
    const siblings = await billingInstallmentsRepository(db).listByProject(inst.grant_project_id);
    address = await svc.lastClientAddress(siblings.map((s) => s.id).filter((id) => id !== installmentId), ctx.clientId);
  }
  const values: InvoiceDraftValues = {
    invoiceNumber: draft?.invoice_number ?? "",
    invoiceDate,
    dueDate: draft?.due_date ?? addDays(invoiceDate, 30),
    clientName: draft?.client_name ?? loaded.projectClientName,
    clientAddress: address ?? "",
    projectName: loaded.projectName,
    installmentNumber: inst.installment_number,
    periodStart: draft?.period_start ?? inst.period_start,
    periodEnd: draft?.period_end ?? inst.period_end,
    description: draft?.description ?? inst.invoice_description ?? "",
    amount: draft?.amount != null ? Number(draft.amount) : await defaultAmount(ctx, inst),
    applyGst: draft?.apply_gst ?? true,
    applyQst: draft?.apply_qst ?? true,
  };
  return { error: null, hasTemplate: !!template, values, sentDocumentId: draft?.sent_document_id ?? null };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const valuesSchema = z.object({
  invoiceNumber: z.string().trim().max(60),
  invoiceDate: isoDate,
  dueDate: isoDate,
  clientName: z.string().trim().max(200),
  clientAddress: z.string().trim().max(500),
  description: z.string().trim().max(6000),
  amount: z.number({ invalid_type_error: "Montant invalide." }).min(0, "Montant invalide.").max(100_000_000),
  applyGst: z.boolean(),
  applyQst: z.boolean(),
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
});
export type InvoiceDraftInput = z.input<typeof valuesSchema>;

async function prepare(installmentId: string, input: InvoiceDraftInput) {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal } as const;
  const parsed = valuesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." } as const;
  const loaded = await loadInstallment(installmentId);
  if (!loaded) return { error: "Versement introuvable ou accès refusé." } as const;
  const v = parsed.data;
  const values: InvoiceDraftValues = {
    ...v,
    amount: Math.round(v.amount * 100) / 100,
    projectName: loaded.projectName,
    installmentNumber: loaded.installment.installment_number,
  };
  await invoiceTemplatesService(admin()).saveDraft({
    installment_id: installmentId,
    issuer_client_id: ctx.clientId,
    organization_id: loaded.installment.organization_id,
    invoice_number: values.invoiceNumber || null,
    invoice_date: values.invoiceDate,
    due_date: values.dueDate,
    period_start: values.periodStart,
    period_end: values.periodEnd,
    client_name: values.clientName || null,
    client_address: values.clientAddress || null,
    description: values.description || null,
    amount: values.amount,
    apply_gst: values.applyGst,
    apply_qst: values.applyQst,
    updated_by: ctx.organizationUserId,
  });
  return { ctx, loaded, values } as const;
}

export async function saveInvoiceDraftAction(installmentId: string, input: InvoiceDraftInput): Promise<{ error: string | null }> {
  try {
    const r = await prepare(installmentId, input);
    if ("error" in r) return { error: r.error ?? "Erreur." };
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

async function render(ctx: PortalContext, values: InvoiceDraftValues): Promise<{ buffer: Buffer; filename: string }> {
  const db = admin();
  const template = await invoiceTemplatesService(db).getForClient(ctx.clientId);
  if (!template) throw new Error("Aucun modèle de facture : téléversez d'abord votre facture vierge (menu « Modèle de facture »).");
  return { buffer: await invoiceTemplatesService(db).render(template, values), filename: generatedInvoiceFilename(values) };
}

export async function downloadGeneratedInvoiceAction(installmentId: string, input: InvoiceDraftInput): Promise<{ error: string | null; filename?: string; base64?: string }> {
  try {
    const r = await prepare(installmentId, input);
    if ("error" in r) return { error: r.error ?? "Erreur." };
    const out = await render(r.ctx, r.values);
    return { error: null, filename: out.filename, base64: out.buffer.toString("base64") };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function sendGeneratedInvoiceAction(installmentId: string, input: InvoiceDraftInput): Promise<{ error: string | null; message?: string }> {
  try {
    const r = await prepare(installmentId, input);
    if ("error" in r) return { error: r.error ?? "Erreur." };
    const { ctx, loaded, values } = r;
    if (!values.invoiceNumber) return { error: "Inscrivez votre numéro de facture avant de l'envoyer." };
    const out = await render(ctx, values);
    const file = new File([new Uint8Array(out.buffer)], out.filename, { type: DOCX_MIME });
    const extraction = extractionFromDraft(values, ctx.clientName);
    const db = admin();
    const inst = loaded.installment;
    const actor = { organizationId: inst.organization_id, organizationUserId: ctx.organizationUserId ?? "" };

    let documentId: string;
    let issues: number | null = null;
    if (inst.client_invoice_document_id) {
      // Une facture était déjà envoyée sur ce versement : la nouvelle la remplace.
      const rep = await replaceInvoiceFile(db, {
        organizationId: inst.organization_id,
        grantProjectId: inst.grant_project_id,
        clientId: loaded.projectClientId,
        expenseId: null,
        installmentId: inst.id,
        file,
        uploadedBy: ctx.organizationUserId,
        source: "client_portal",
        extraction,
      });
      documentId = rep.documentId;
      issues = rep.read && rep.read.status !== "skipped" ? rep.read.issues : null;
      await logDossierEvent(db, actor, {
        grant_project_id: inst.grant_project_id,
        client_id: ctx.clientId,
        kind: "invoice_replaced_portal",
        title: `Facture remplacée par le client : ${rep.oldFilenames.join(", ") || "ancienne version"} → ${file.name}`,
        detail: "Facture générée par Apex à partir du modèle du fournisseur.",
        source: "portal",
        ref_type: "billing_installment",
        ref_id: inst.id,
      });
    } else {
      const path = `${inst.organization_id}/${loaded.projectClientId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, { contentType: DOCX_MIME, upsert: false });
      if (uploadError) throw uploadError;
      const { data: doc, error: docError } = await db
        .from("documents")
        .insert({ organization_id: inst.organization_id, filename: file.name, storage_path: path, mime_type: DOCX_MIME, size: file.size, category: "invoice", client_id: loaded.projectClientId, grant_project_id: inst.grant_project_id, uploaded_by: ctx.organizationUserId, source: "client_portal" })
        .select("id")
        .single();
      if (docError) throw docError;
      documentId = (doc as { id: string }).id;
      const updated = await billingInstallmentsRepository(db).update(inst.id, {
        client_invoice_document_id: documentId,
        client_invoice_uploaded_at: new Date().toISOString(),
        client_invoice_uploaded_by: ctx.organizationUserId,
      });
      await logDossierEvent(db, actor, {
        grant_project_id: inst.grant_project_id,
        client_id: ctx.clientId,
        kind: "installment_invoice_received_portal",
        title: `Facture reçue du client pour le versement n°${inst.installment_number}`,
        detail: "Facture générée par Apex à partir du modèle du fournisseur.",
        source: "portal",
        ref_type: "billing_installment",
        ref_id: inst.id,
      });
      try {
        const read = await portalInvoiceIntakeService(db).processDocument({ organizationId: inst.organization_id }, inst.grant_project_id, documentId, updated, { extraction });
        issues = read.status !== "skipped" ? read.issues : null;
      } catch {
        issues = null; // best-effort : la facture est déjà envoyée
      }
    }

    await invoiceTemplatesService(db).saveDraft({
      installment_id: inst.id,
      issuer_client_id: ctx.clientId,
      organization_id: inst.organization_id,
      invoice_number: values.invoiceNumber,
      invoice_date: values.invoiceDate,
      due_date: values.dueDate,
      period_start: values.periodStart,
      period_end: values.periodEnd,
      client_name: values.clientName || null,
      client_address: values.clientAddress || null,
      description: values.description || null,
      amount: values.amount,
      apply_gst: values.applyGst,
      apply_qst: values.applyQst,
      sent_document_id: documentId,
      updated_by: ctx.organizationUserId,
    });
    await notifyUser(db, { organizationId: inst.organization_id, organizationUserId: ctx.organizationUserId }, {
      userId: loaded.ownerId,
      type: "ai_review",
      message: `Facture n° ${values.invoiceNumber} envoyée depuis le portail (versement n°${inst.installment_number}, ${loaded.projectName})${issues ? ` : ${issues} incohérence(s) à vérifier` : " : à approuver"}`,
      href: `/grants/${inst.grant_project_id}`,
      entity_type: "grant_project",
      entity_id: inst.grant_project_id,
    });

    revalidatePath("/portal");
    return { error: null, message: `Facture n° ${values.invoiceNumber} envoyée à Apex pour le versement ${inst.installment_number}.` };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}
