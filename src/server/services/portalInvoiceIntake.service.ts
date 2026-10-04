import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzableMime, analyzeInvoiceFile, amountBeforeTax, invoiceAnalysisAvailable, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";
import { matchSupplier } from "@/features/invoices/matchSupplier";
import { checkInstallmentInvoice, draftClientNote, expectedShareForSupplier } from "@/features/invoices/checkInstallmentInvoice";
import { expensesRepository, type ExpenseRow } from "@/server/repositories/expenses.repository";
import { projectSuppliersRepository, type ProjectSupplierRow } from "@/server/repositories/projectSuppliers.repository";
import { billingLineItemsRepository } from "@/server/repositories/billingLineItems.repository";
import { billingInstallmentsRepository, type BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";

// Facture reçue du portail pour un versement (0054) -> ligne pré-remplie dans le tableau
// Fournisseurs du dossier (0073, Jade) : numéro, document, date, montant AVANT taxes, sous le bon
// fournisseur et liée au versement, marquée « à vérifier » -- il ne reste qu'à « Confirmer ».
// Les incohérences avec le versement prévu sont enregistrées avec un brouillon de note au client.
//
// Garde-fous :
//  - ne crée JAMAIS de nouveau fournisseur (contrairement au téléversement côté personnel) : une
//    facture déposée par un client ne doit pas ajouter de ligne au budget du dossier -- émetteur
//    non reconnu = rattachée au seul fournisseur facturant s'il n'y en a qu'un, sinon laissée
//    « sans fournisseur » (choix dans le tableau), et signalée dans les incohérences ;
//  - ne modifie JAMAIS une facture déjà présente (saisie à la main ou déjà lue) : on lui ajoute
//    seulement le lien au versement et le contrôle ;
//  - best-effort : l'appelant ne fait jamais échouer le téléversement du client si ceci échoue.

const BUCKET = "apex-documents";

export type IntakeResult =
  | { status: "created" | "linked_existing"; expenseId: string; issues: number; supplierName: string | null; amount: number | null }
  | { status: "skipped"; reason: string };

type Ctx = { organizationId: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function portalInvoiceIntakeService(supabase: SupabaseClient) {
  const expensesRepo = expensesRepository(supabase);
  const suppliersRepo = projectSuppliersRepository(supabase);
  const lineItemsRepo = billingLineItemsRepository(supabase);
  const installmentsRepo = billingInstallmentsRepository(supabase);
  const documentsRepo = documentsRepository(supabase);

  async function expenseLinkedToDocument(documentId: string, expenses: ExpenseRow[]): Promise<ExpenseRow | null> {
    if (expenses.length === 0) return null;
    const links = await documentsRepo.listInvoiceLinks(expenses.map((e) => e.id));
    const link = links.find((l) => l.document_id === documentId);
    return link ? (expenses.find((e) => e.id === link.expense_id) ?? null) : null;
  }

  async function loadFile(documentId: string): Promise<{ filename: string; bytes: ArrayBuffer; mime: string } | { error: string }> {
    const { data: doc, error } = await supabase.from("documents").select("filename, storage_path, size").eq("id", documentId).maybeSingle();
    if (error || !doc) return { error: "document introuvable" };
    const d = doc as { filename: string; storage_path: string; size: number | null };
    const mime = analyzableMime(d.filename);
    if (!mime) return { error: "format non lisible automatiquement (PDF ou image seulement)" };
    if (d.size != null && d.size > MAX_INVOICE_BYTES) return { error: "fichier trop volumineux pour la lecture automatique (4 Mo max)" };
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(d.storage_path);
    if (dlError || !blob) return { error: "fichier introuvable dans le stockage" };
    return { filename: d.filename, bytes: await blob.arrayBuffer(), mime };
  }

  // Fournisseur de la facture : nom lu reconnu parmi les fournisseurs EXTERNES du dossier ; sinon
  // le seul fournisseur qui a des postes « À facturer » ; sinon le seul fournisseur externe.
  function pickSupplier(supplierName: string | null, suppliers: ProjectSupplierRow[], billableSupplierIds: Set<string>) {
    const external = suppliers.filter((s) => !s.is_employee);
    const byName = supplierName ? matchSupplier(supplierName, external) : null;
    if (byName) return { supplier: byName, matchedByName: true };
    const billing = external.filter((s) => billableSupplierIds.has(s.id));
    if (billing.length === 1) return { supplier: billing[0]!, matchedByName: false };
    if (external.length === 1) return { supplier: external[0]!, matchedByName: false };
    return { supplier: null, matchedByName: false };
  }

  return {
    async processInstallment(ctx: Ctx, installment: BillingInstallmentRow): Promise<IntakeResult> {
      const documentId = installment.client_invoice_document_id;
      if (!documentId) return { status: "skipped", reason: "aucune facture reçue sur ce versement" };
      if (!invoiceAnalysisAvailable()) return { status: "skipped", reason: "lecture automatique non configurée (ANTHROPIC_API_KEY)" };

      const [expenses, suppliers, lineItems] = await Promise.all([
        expensesRepo.listByProject(installment.grant_project_id),
        suppliersRepo.listByProject(installment.grant_project_id),
        lineItemsRepo.listByProject(installment.grant_project_id),
      ]);

      const file = await loadFile(documentId);
      if ("error" in file) return { status: "skipped", reason: file.error };

      const x = await analyzeInvoiceFile({ bytes: file.bytes, mime: file.mime });
      const billableSupplierIds = new Set(lineItems.filter((it) => it.included_in_billing && it.supplier_id).map((it) => it.supplier_id as string));
      const { supplier, matchedByName } = pickSupplier(x.supplier_name, suppliers, billableSupplierIds);
      const amount = amountBeforeTax(x);

      // Facture déjà au tableau ? (même document, ou même fournisseur + même numéro + même total)
      const existing =
        (await expenseLinkedToDocument(documentId, expenses)) ??
        (x.invoice_number ? (expenses.find((e) => e.invoice_number === x.invoice_number && e.supplier_id === (supplier?.id ?? null) && Number(e.total) === x.total) ?? null) : null);

      const effectiveSupplierId = existing?.supplier_id ?? supplier?.id ?? null;
      const effectiveSupplierName = suppliers.find((s) => s.id === effectiveSupplierId)?.name ?? null;
      const issues = checkInstallmentInvoice(x, {
        installment: {
          installment_number: installment.installment_number,
          period_start: installment.period_start,
          period_end: installment.period_end,
          expected_amount: expectedShareForSupplier(Number(installment.amount), effectiveSupplierId, lineItems),
        },
        filename: file.filename,
        supplierName: effectiveSupplierName,
        supplierMatchedByName: matchedByName,
        otherInvoices: expenses.filter((e) => e.id !== existing?.id),
        supplierId: effectiveSupplierId,
        today: todayIso(),
      });
      const note = draftClientNote(issues, x, { installment: { installment_number: installment.installment_number, period_start: installment.period_start, period_end: installment.period_end, expected_amount: null }, filename: file.filename });

      if (existing) {
        await expensesRepo.updateReview(existing.id, { billing_installment_id: installment.id, review_issues: issues, review_note: note });
        return { status: "linked_existing", expenseId: existing.id, issues: issues.length, supplierName: effectiveSupplierName, amount: Number(existing.eligible_amount ?? existing.subtotal ?? existing.total ?? 0) || null };
      }

      if (!x.is_invoice) {
        // Pas une facture : rien n'est ajouté au tableau, mais le contrôle reste visible côté
        // facturation (aucune ligne à approuver).
        return { status: "skipped", reason: "le document ne ressemble pas à une facture" };
      }

      const expense = await expensesRepo.create({
        organization_id: ctx.organizationId,
        grant_project_id: installment.grant_project_id,
        supplier_id: supplier?.id ?? null,
        invoice_number: x.invoice_number,
        invoice_date: x.invoice_date,
        subtotal: amount,
        tax: x.tax,
        total: x.total,
        eligible_amount: amount,
        status: "to_review",
        source: "ai",
        billing_installment_id: installment.id,
        review_issues: issues,
        review_note: note,
      });
      await documentsRepo.setInvoiceDocument(ctx.organizationId, expense.id, documentId);
      return { status: "created", expenseId: expense.id, issues: issues.length, supplierName: supplier?.name ?? null, amount };
    },

    // Versements dont la facture reçue du portail n'est pas encore au tableau (ni liée au
    // versement, ni rattachée à une facture via son document) -- pour rattraper les factures
    // reçues avant cette fonctionnalité, ou une lecture qui a échoué.
    async pendingInstallments(grantProjectId: string): Promise<BillingInstallmentRow[]> {
      const [installments, expenses] = await Promise.all([installmentsRepo.listByProject(grantProjectId), expensesRepo.listByProject(grantProjectId)]);
      const withDoc = installments.filter((i) => i.client_invoice_document_id);
      if (withDoc.length === 0) return [];
      const linkedInstallments = new Set(expenses.map((e) => e.billing_installment_id).filter(Boolean));
      return withDoc.filter((i) => !linkedInstallments.has(i.id));
    },
  };
}
