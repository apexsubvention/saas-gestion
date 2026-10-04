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
import { billingLineItemsService } from "@/server/services/billingLineItems.service";
import { portalInvoiceIntakeService } from "@/server/services/portalInvoiceIntake.service";
import { dossierNotesService } from "@/server/services/dossierNotes.service";

const fmtMoney = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
const OVERRIDE_FIELD_LABELS = { accepted: "Subvention acceptée", claimed: "Réclamé à ce jour", budget: "Budget prévu" } as const;

// Actions du tableau fournisseurs / factures d'un dossier. Chaque action revérifie que les
// identifiants reçus appartiennent bien à CE dossier (la RLS protège l'accès, pas la cohérence).

export type LedgerActionResult = { error: string | null; id?: string; message?: string };

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
  // Jade (0065, PARI CNRC/IRAP) : salarié interne plutôt que fournisseur externe -- optionnels,
  // absents = comportement inchangé (fournisseur externe ordinaire).
  is_employee: z.boolean().optional(),
  role: optionalText(150).optional(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

const invoiceSchema = z.object({
  id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid().nullable(),
  invoice_number: optionalText(80),
  invoice_date: isoDate,
  amount: money,
  document_id: z.string().uuid().nullable(),
  // Jade (0065) : coût d'un salarié interne (heures x taux horaire) -- optionnels, sans effet pour
  // un fournisseur externe ordinaire.
  hours: z.number().min(0, "Heures invalides").max(100_000, "Heures invalides").nullable().optional(),
  hourly_rate: money.optional(),
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

// Statut de paiement d'une facture (0057) : « Envoyée, non payée » / « Payée ». Le personnel
// écrit ici directement (RLS normale -- expenses_update exige admin/employee, déjà le cas du
// personnel) ; le portail (enfant/parent) passe par une action séparée dans
// portal/(app)/actions.ts qui vérifie l'accès puis écrit avec le client admin, RLS lui refusant
// l'écriture directe.
export async function updateInvoicePaymentStatusAction(grantProjectId: string, invoiceId: string, status: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  if (status !== "sent_unpaid" && status !== "paid") return { error: "Statut de paiement invalide." };
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    await supplierLedgerService(supabase).updatePaymentStatus(invoiceId, status, ctx.organizationUserId);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "invoice_payment_status_changed",
      title: status === "paid" ? "Facture marquée payée" : "Facture marquée envoyée, non payée",
      source: "manual",
      ref_type: "expense",
      ref_id: invoiceId,
    });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Choisir, parmi les documents déjà déposés sur ce dossier, lequel est la preuve de paiement
// d'une facture (ou en retirer un -- documentId = null). Voir DocumentSelect (déjà utilisé pour
// le document de la facture elle-même) pour l'équivalent en UI.
export async function setInvoicePaymentProofAction(grantProjectId: string, invoiceId: string, documentId: string | null): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    if (documentId) {
      const ok = (await documentsService(supabase).listByProject(grantProjectId)).some((d) => d.id === documentId);
      if (!ok) return { error: "Document introuvable dans ce dossier." };
    }
    await supplierLedgerService(supabase).setPaymentProof(ctx.organizationId, invoiceId, documentId);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "invoice_payment_proof_set",
      title: documentId ? "Preuve de paiement ajoutée à une facture" : "Preuve de paiement retirée d'une facture",
      source: "manual",
      ref_type: "expense",
      ref_id: invoiceId,
    });
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
  field: "accepted" | "claimed" | "budget",
  value: number | null
): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  if (field !== "accepted" && field !== "claimed" && field !== "budget") return { error: "Champ invalide." };
  if (value != null && (!Number.isFinite(value) || value < 0 || value > 100_000_000)) return { error: "Montant invalide." };

  const supabase = await createClient();
  try {
    const before = (await projectSuppliersService(supabase).listByProject(grantProjectId)).find((s) => s.id === supplierId);
    if (!before) return { error: "Fournisseur introuvable dans ce dossier." };
    await supplierLedgerService(supabase).setOverride(supplierId, field, value, ctx.organizationUserId);
    const column = field === "accepted" ? "accepted_subsidy_override" : field === "claimed" ? "claimed_override" : "budget_amount";
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

// Poste budgétaire (Aide à la facturation) modifié directement depuis « Détails » d'un
// fournisseur (0060, Jade) : même poste, même validation -- juste un autre point d'entrée que
// la liste complète. included/exclusion_reason/supplier_id gardent leur sens habituel.
const lineItemPatchSchema = z.object({
  label: z.string().trim().min(1, "Le libellé est requis.").max(300),
  description: optionalText(2000),
  amount: money.refine((v) => v != null, "Montant invalide.").transform((v) => v as number),
  hours: z.number().min(0, "Heures invalides").max(100_000, "Heures invalides").nullable(),
  included_in_billing: z.boolean(),
  exclusion_reason: z.enum(["internal_salary", "redistribute_supplier", "new_supplier"]).nullable(),
  supplier_id: z.string().uuid().nullable(),
  // Taux d'aide spécifique à ce poste (0061, Jade) -- fraction 0-1, déjà convertie côté client
  // (saisie en % dans le formulaire) ; null = utilise le taux du dossier.
  subsidy_rate: z.number().min(0, "Taux invalide").max(1, "Taux invalide").nullable(),
});
export type LineItemPatchInput = z.input<typeof lineItemPatchSchema>;

export async function updateBillingLineItemAction(grantProjectId: string, itemId: string, input: LineItemPatchInput): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const parsed = lineItemPatchSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  try {
    await billingLineItemsService(supabase).updateOne(grantProjectId, itemId, parsed.data);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "billing_line_item_updated",
      title: `Poste modifié : ${parsed.data.label}`,
      source: "manual",
      ref_type: "billing_line_item",
      ref_id: itemId,
    });
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath(`/grants/${grantProjectId}/facturation`);
    return { error: null, id: itemId };
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

// ---- Factures reçues du portail (0073, Jade) ---------------------------------------------------

// Lire les factures reçues du portail qui ne sont pas encore au tableau (reçues avant cette
// fonctionnalité, ou lecture échouée au moment du téléversement). Une à une, best-effort : une
// facture illisible n'empêche pas les autres.
export async function processPortalInvoicesAction(grantProjectId: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const intake = portalInvoiceIntakeService(supabase);
    const pending = await intake.pendingInstallments(grantProjectId);
    if (pending.length === 0) return { error: null, message: "Aucune facture du portail en attente de lecture." };
    const done: string[] = [];
    const skipped: string[] = [];
    for (const inst of pending) {
      try {
        const r = await intake.processInstallment({ organizationId: ctx.organizationId }, inst);
        if (r.status === "skipped") skipped.push(`versement ${inst.installment_number} : ${r.reason}`);
        else {
          done.push(`versement ${inst.installment_number}${r.issues > 0 ? ` (${r.issues} incohérence${r.issues > 1 ? "s" : ""})` : ""}`);
          await logDossierEvent(supabase, ctx, {
            grant_project_id: grantProjectId,
            kind: "installment_invoice_read",
            title: `Facture du versement n°${inst.installment_number} lue et ajoutée au tableau Fournisseurs${r.issues > 0 ? ` -- ${r.issues} incohérence(s) à vérifier` : " -- à approuver"}`,
            source: "ai",
            ref_type: "expense",
            ref_id: r.expenseId,
          });
        }
      } catch (e) {
        skipped.push(`versement ${inst.installment_number} : ${formatCaughtError(e)}`);
      }
    }
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath(`/grants/${grantProjectId}/facturation`);
    const parts = [];
    if (done.length) parts.push(`Lue(s) et pré-remplie(s) : ${done.join(", ")}.`);
    if (skipped.length) parts.push(`Non lue(s) : ${skipped.join(" ; ")}.`);
    return { error: null, message: parts.join(" ") };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Envoyer la note d'incohérence au client : publiée dans le fil de notes du dossier, visible dans
// son portail (dossier_notes, 0046). Le texte envoyé est celui affiché (modifiable avant envoi).
export async function sendInvoiceReviewNoteAction(grantProjectId: string, invoiceId: string, body: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    const { data: project, error } = await supabase.from("grant_projects").select("client_id").eq("id", grantProjectId).maybeSingle();
    if (error || !project) return { error: "Dossier introuvable." };
    const clientId = (project as { client_id: string }).client_id;
    const note = await dossierNotesService(supabase).add({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientId,
      authorOrgUserId: ctx.organizationUserId,
      authorRole: "staff",
      authorName: ctx.fullName || "Membre de l'équipe",
      body,
      visibleToClient: true,
    });
    await supplierLedgerService(supabase).markReviewNoteSent(invoiceId, note.id, body.trim());
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, client_id: clientId, kind: "invoice_review_note_sent", title: "Note d'incohérence de facture envoyée au client", source: "manual", ref_type: "expense", ref_id: invoiceId });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// « Ignorer » : les incohérences ne concernent plus (vérifié, c'est voulu) -- la facture reste
// telle quelle, toujours à confirmer séparément si elle est encore « à vérifier ».
export async function dismissInvoiceReviewAction(grantProjectId: string, invoiceId: string): Promise<LedgerActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    if (!(await ownedInvoice(supabase, grantProjectId, invoiceId))) return { error: "Facture introuvable dans ce dossier." };
    await supplierLedgerService(supabase).dismissReviewIssues(invoiceId);
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "invoice_review_dismissed", title: "Incohérences de facture ignorées", source: "manual", ref_type: "expense", ref_id: invoiceId });
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}
