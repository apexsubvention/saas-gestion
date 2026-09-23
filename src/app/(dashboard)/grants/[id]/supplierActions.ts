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
import { logAudit, logDossierEvent, listDossierEventsByRef, type DossierEventRow } from "@/server/services/audit";
import { claimsService } from "@/server/services/claims.service";

const fmtMoney = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
const OVERRIDE_FIELD_LABELS = { accepted: "Subvention acceptée", claimed: "Réclamé à ce jour" } as const;

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
      await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "supplier_updated", title: `Fournisseur modifié : ${fields.name}`, source: "manual", ref_type: "project_supplier", ref_id: id });
      revalidatePath(`/grants/${grantProjectId}`);
      return { error: null, id };
    }
    const created = await projectSuppliersService(supabase).create(ctx.organizationId, grantProjectId, fields);
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "supplier_added", title: `Fournisseur ajouté : ${fields.name}`, source: "manual", ref_type: "project_supplier", ref_id: created.id });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null, id: created.id };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteSupplierAction(grantProjectId: string, supplierId: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const target = (await projectSuppliersService(supabase).listByProject(grantProjectId)).find((s) => s.id === supplierId);
    if (!target) return { error: "Fournisseur introuvable dans ce dossier." };
    const removed = await supplierLedgerService(supabase).removeSupplier(supplierId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "supplier_removed", title: `Fournisseur supprimé : ${target.name}`, detail: "Ses factures sont conservées, sans fournisseur.", source: "manual" });
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
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: id ? "invoice_updated" : "invoice_added", title: id ? "Facture modifiée" : "Facture ajoutée", detail: [fields.invoice_number && `N° ${fields.invoice_number}`, fields.amount != null && `${fields.amount} $ avant taxes`, fields.invoice_date].filter(Boolean).join(" · ") || null, source: "manual", ref_type: "expense", ref_id: savedId });
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
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    await supplierLedgerService(supabase).confirmInvoice(invoiceId);
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "invoice_confirmed", title: "Facture lue par Apex confirmée", source: "manual", ref_type: "expense", ref_id: invoiceId });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteInvoiceAction(grantProjectId: string, invoiceId: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    const removed = await supplierLedgerService(supabase).removeInvoice(invoiceId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "invoice_deleted", title: "Facture supprimée du tableau", detail: "Le document téléversé est conservé.", source: "manual" });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Modifier à la main une valeur du suivi financier (subvention acceptée / réclamé à ce jour), ou
// revenir au calcul automatique (value = null). La valeur automatique n'est jamais détruite ; le
// changement est journalisé (qui, quand, avant/après).
export async function setSupplierOverrideAction(
  grantProjectId: string,
  supplierId: string,
  field: "accepted" | "claimed",
  value: number | null
): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  if (field !== "accepted" && field !== "claimed") return { error: "Champ invalide." };
  if (value != null && (!Number.isFinite(value) || value < 0 || value > 100_000_000)) return { error: "Montant invalide." };

  const supabase = await createClient();
  try {
    const before = (await projectSuppliersService(supabase).listByProject(grantProjectId)).find((s) => s.id === supplierId);
    if (!before) return { error: "Fournisseur introuvable dans ce dossier." };
    await supplierLedgerService(supabase).setOverride(supplierId, field, value, ctx.organizationUserId);
    const column = field === "accepted" ? "accepted_subsidy_override" : "claimed_override";
    const beforeValue = (before as unknown as Record<string, unknown>)[column] as number | null | undefined;
    await logAudit(supabase, ctx, {
      action: value == null ? "override_reverted" : "override_set",
      entity_type: "project_supplier",
      entity_id: supplierId,
      before: { field: column, value: beforeValue ?? null },
      after: { field: column, value },
    });
    // Journalisé aussi dans dossier_events (pas seulement audit_logs, réservé aux admins) : c'est ce qui
    // alimente le bouton « Historique » du tableau fournisseurs, visible par tout le personnel du dossier.
    const label = OVERRIDE_FIELD_LABELS[field];
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: value == null ? "supplier_override_reverted" : "supplier_override_set",
      title: value == null ? `${label} : retour au calcul automatique` : `${label} modifiée manuellement : ${fmtMoney(value)}`,
      detail: value == null
        ? beforeValue != null ? `Valeur manuelle effacée : ${fmtMoney(beforeValue)}` : null
        : beforeValue != null ? `Valeur manuelle précédente : ${fmtMoney(beforeValue)}` : null,
      source: "manual",
      ref_type: "project_supplier",
      ref_id: supplierId,
    });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Historique des modifications d'UN fournisseur (ajout, champs modifiés, valeurs ajustées à la main) --
// alimente le bouton « Historique » du tableau fournisseurs. Chargé à la demande (pas au chargement de
// la page) pour ne pas multiplier les requêtes tant que personne ne l'ouvre.
export async function getSupplierHistoryAction(grantProjectId: string, supplierId: string): Promise<{ error: string | null; events?: DossierEventRow[] }> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === supplierId);
    if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
    const events = await listDossierEventsByRef(supabase, grantProjectId, "project_supplier", supplierId);
    return { error: null, events };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function moveSupplierAction(grantProjectId: string, supplierId: string, direction: "up" | "down"): Promise<LedgerActionResult> {
  await requireOrgContext();
  if (direction !== "up" && direction !== "down") return { error: "Direction invalide." };
  const supabase = await createClient();
  try {
    const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === supplierId);
    if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
    await supplierLedgerService(supabase).moveSupplier(grantProjectId, supplierId, direction);
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Lier une facture à une réclamation (ou la délier) : c'est ce qui alimente « Réclamé à ce jour » automatiquement.
export async function linkInvoiceClaimAction(grantProjectId: string, invoiceId: string, claimId: string | null, claimedAmount: number | null): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  if (claimId && !z.string().uuid().safeParse(claimId).success) return { error: "Réclamation invalide." };
  if (claimedAmount != null && (!Number.isFinite(claimedAmount) || claimedAmount < 0 || claimedAmount > 100_000_000)) return { error: "Montant invalide." };
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    let claimLabel: string | null = null;
    if (claimId) {
      const claim = (await claimsService(supabase).listByProject(grantProjectId)).find((c) => c.id === claimId);
      if (!claim) return { error: "Réclamation introuvable dans ce dossier." };
      claimLabel = claim.claim_number ?? "réclamation";
    }
    await supplierLedgerService(supabase).linkInvoiceToClaim(ctx.organizationId, invoiceId, claimId, claimedAmount);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: claimId ? "invoice_claimed" : "invoice_unclaimed",
      title: claimId ? `Facture liée à ${claimLabel}` : "Facture retirée d'une réclamation",
      source: "manual",
      ref_type: "expense",
      ref_id: invoiceId,
    });
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}
