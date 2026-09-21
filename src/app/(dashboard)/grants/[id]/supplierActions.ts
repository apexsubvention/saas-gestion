"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { documentsService } from "@/server/services/documents.service";
import { expensesRepository } from "@/server/repositories/expenses.repository";

// Actions du tableau fournisseurs / factures d'un dossier. Chaque action revérifie que les
// identifiants reçus appartiennent bien à CE dossier (la RLS protège l'accès, pas la cohérence).

export type LedgerActionResult = { error: string | null; id?: string };

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
const money = z.number({ invalid_type_error: "Montant invalide" }).min(0, "Montant invalide").max(100_000_000).nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").refine((s) => !Number.isNaN(Date.parse(s)), "Date invalide").nullable();

const supplierSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Le nom du fournisseur est requis.").max(200),
  budget_amount: money,
  contact: optionalText(200),
  billing_frequency: optionalText(100),
  expected_invoice_day: z.number().int().min(1, "Jour entre 1 et 31").max(31, "Jour entre 1 et 31").nullable(),
  invoice_description_requirements: optionalText(1000),
  supplier_client_id: z.string().uuid().nullable(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

const invoiceSchema = z.object({
  id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid().nullable(),
  invoice_number: optionalText(80),
  invoice_date: isoDate,
  amount: money,
  document_id: z.string().uuid().nullable(),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Formulaire invalide";
}

export async function saveSupplierAction(grantProjectId: string, input: SupplierInput): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  try {
    if (id) {
      const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === id);
      if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
      await supplierLedgerService(supabase).saveSupplier(id, fields);
      revalidatePath(`/grants/${grantProjectId}`);
      return { error: null, id };
    }
    const created = await projectSuppliersService(supabase).create(ctx.organizationId, grantProjectId, fields);
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null, id: created.id };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteSupplierAction(grantProjectId: string, supplierId: string): Promise<LedgerActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === supplierId);
    if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
    const removed = await supplierLedgerService(supabase).removeSupplier(supplierId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function saveInvoiceAction(grantProjectId: string, input: InvoiceInput): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...fields } = parsed.data;

  const supabase = await createClient();
  try {
    if (fields.supplier_id) {
      const ok = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === fields.supplier_id);
      if (!ok) return { error: "Fournisseur introuvable dans ce dossier." };
    }
    if (fields.document_id) {
      const ok = (await documentsService(supabase).listByProject(grantProjectId)).some((d) => d.id === fields.document_id);
      if (!ok) return { error: "Document introuvable dans ce dossier." };
    }
    if (id) {
      const ok = (await expensesRepository(supabase).listByProject(grantProjectId)).some((e) => e.id === id);
      if (!ok) return { error: "Facture introuvable dans ce dossier." };
    }
    const savedId = await supplierLedgerService(supabase).saveInvoice(ctx.organizationId, grantProjectId, id, fields);
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null, id: savedId };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

async function ownedInvoice(supabase: Awaited<ReturnType<typeof createClient>>, grantProjectId: string, invoiceId: string) {
  return (await expensesRepository(supabase).listByProject(grantProjectId)).some((e) => e.id === invoiceId);
}

export async function confirmInvoiceAction(grantProjectId: string, invoiceId: string): Promise<LedgerActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    await supplierLedgerService(supabase).confirmInvoice(invoiceId);
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteInvoiceAction(grantProjectId: string, invoiceId: string): Promise<LedgerActionResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    const removed = await supplierLedgerService(supabase).removeInvoice(invoiceId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}
