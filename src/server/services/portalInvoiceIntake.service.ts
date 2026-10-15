import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzableMime, analyzeInvoiceFile, amountBeforeTax, invoiceAnalysisAvailable, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";
import { matchSupplier } from "@/features/invoices/matchSupplier";
import { checkInstallmentInvoice, draftClientNote, expectedShareForSupplier } from "@/features/invoices/checkInstallmentInvoice";
import { expensesRepository, type ExpenseRow } from "@/server/repositories/expenses.repository";
import { projectSuppliersRepository, type ProjectSupplierRow } from "@/server/repositories/projectSuppliers.repository";
import { billingLineItemsRepository } from "@/server/repositories/billingLineItems.repository";
import { billingInstallmentsRepository, type BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { grantAgreementsRepository } from "@/server/repositories/grantAgreements.repository";
import { budgetLinesRepository } from "@/server/repositories/budgetLines.repository";
import { buildProjectContext } from "@/features/invoices/projectContext";

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

  // Projet déposé (0078) : période (dépenses admissibles de la convention, sinon début/fin du
  // projet), entreprise bénéficiaire (+ son parent), et résumé du contenu accepté pour comparer.
  async function loadProjectFacts(grantProjectId: string, lineItems: Awaited<ReturnType<typeof lineItemsRepo.listByProject>>, suppliers: ProjectSupplierRow[], installment: BillingInstallmentRow | null) {
    const [{ data: project }, agreements, budgetLines] = await Promise.all([
      supabase.from("grant_projects").select("name, client_id, official_start_date, official_end_date, grant_programs(name)").eq("id", grantProjectId).maybeSingle(),
      grantAgreementsRepository(supabase).listByProject(grantProjectId).catch(() => []),
      budgetLinesRepository(supabase).listByProject(grantProjectId).catch(() => []),
    ]);
    const proj = project as unknown as { name: string; client_id: string; official_start_date: string | null; official_end_date: string | null; grant_programs: { name: string } | null } | null;
    const agreement = agreements[0] ?? null;
    const clientNames: string[] = [];
    if (proj?.client_id) {
      const { data: client } = await supabase.from("clients").select("name, parent_client_id").eq("id", proj.client_id).maybeSingle();
      const c = client as unknown as { name: string; parent_client_id: string | null } | null;
      if (c?.name) clientNames.push(c.name);
      if (c?.parent_client_id) {
        const { data: parent } = await supabase.from("clients").select("name").eq("id", c.parent_client_id).maybeSingle();
        const pn = (parent as unknown as { name: string } | null)?.name;
        if (pn) clientNames.push(pn);
      }
    }
    const useEligible = !!(agreement?.eligible_expense_period_start || agreement?.eligible_expense_period_end);
    const periodStart = (useEligible ? agreement?.eligible_expense_period_start : null) ?? agreement?.project_start ?? proj?.official_start_date ?? null;
    const periodEnd = (useEligible ? agreement?.eligible_expense_period_end : null) ?? agreement?.project_end ?? proj?.official_end_date ?? null;
    const periodLabel = useEligible ? "la période de dépenses admissibles" : "le projet";
    const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? null;
    const context = buildProjectContext({
      projectName: proj?.name ?? "Projet",
      programName: proj?.grant_programs?.name ?? null,
      clientNames,
      periodStart,
      periodEnd,
      periodLabel,
      activities: lineItems.map((it) => ({ label: it.label, description: it.description, amount: it.amount != null ? Number(it.amount) : null, hours: it.hours != null ? Number(it.hours) : null, included: it.included_in_billing })),
      budgetLines: budgetLines.map((b) => ({
        category: b.category,
        deposited: b.deposited_amount_override ?? b.deposited_amount_auto ?? null,
        accepted: b.accepted_amount_override ?? b.accepted_amount_auto ?? null,
        supplierName: supplierName(b.supplier_id),
      })),
      suppliers: suppliers.map((s) => ({ name: s.name, requirements: s.invoice_description_requirements })),
      specialConditions: agreement?.special_conditions ?? null,
      installmentText: installment?.invoice_description ?? null,
    });
    return { project: { periodStart, periodEnd, periodLabel, clientNames }, context };
  }

  // Retient qu'un document a été lu (0077) -- évite de relire indéfiniment un document qui n'est
  // pas une facture. Facultatif : sans la migration 0077, la colonne n'existe pas et on ignore.
  async function markScanned(documentId: string, result: "invoice" | "not_invoice") {
    await supabase.from("documents").update({ invoice_scan_at: new Date().toISOString(), invoice_scan_result: result }).eq("id", documentId);
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

  const api = {
    // Lecture d'une facture déposée dans le portail -- sur un versement (installment) ou dans
    // « Documents » (installment = null, 0077). Même résultat dans les deux cas : une ligne « à
    // vérifier » sous le bon fournisseur, liée au document, qui ne compte dans aucun total tant
    // qu'elle n'est pas approuvée (supplierLedger.service.ts#isCounted).
    async processDocument(ctx: Ctx, grantProjectId: string, documentId: string, installment: BillingInstallmentRow | null = null): Promise<IntakeResult> {
      if (!invoiceAnalysisAvailable()) return { status: "skipped", reason: "lecture automatique non configurée (ANTHROPIC_API_KEY)" };

      const [expenses, suppliers, lineItems, ledger] = await Promise.all([
        expensesRepo.listByProject(grantProjectId),
        suppliersRepo.listByProject(grantProjectId),
        lineItemsRepo.listByProject(grantProjectId),
        supplierLedgerService(supabase).load(grantProjectId),
      ]);

      const file = await loadFile(documentId);
      if ("error" in file) return { status: "skipped", reason: file.error };

      const facts = await loadProjectFacts(grantProjectId, lineItems, suppliers, installment);
      const x = await analyzeInvoiceFile({ bytes: file.bytes, mime: file.mime }, facts.context);
      await markScanned(documentId, x.is_invoice ? "invoice" : "not_invoice");
      const billableSupplierIds = new Set(lineItems.filter((it) => it.included_in_billing && it.supplier_id).map((it) => it.supplier_id as string));
      const { supplier, matchedByName } = pickSupplier(x.supplier_name, suppliers, billableSupplierIds);
      const amount = amountBeforeTax(x);

      // Facture déjà au tableau ? (même document, ou même fournisseur + même numéro + même total)
      const existing =
        (await expenseLinkedToDocument(documentId, expenses)) ??
        (x.invoice_number ? (expenses.find((e) => e.invoice_number === x.invoice_number && e.supplier_id === (supplier?.id ?? null) && Number(e.total) === x.total) ?? null) : null);

      const effectiveSupplierId = existing?.supplier_id ?? supplier?.id ?? null;
      const effectiveSupplierName = suppliers.find((s) => s.id === effectiveSupplierId)?.name ?? null;
      // Budget du fournisseur (0077) : Budget prévu, déjà facturé (approuvé) et en attente
      // d'approbation -- sans compter la facture elle-même si elle est déjà au tableau.
      const ledgerSupplier = ledger.suppliers.find((s) => s.id === effectiveSupplierId) ?? null;
      const pendingOthers = ledgerSupplier
        ? ledgerSupplier.invoices.filter((i) => i.status === "to_review" && i.id !== existing?.id).reduce((sum, i) => sum + (i.amount ?? 0), 0)
        : 0;
      const installmentForCheck = installment
        ? {
            installment_number: installment.installment_number,
            period_start: installment.period_start,
            period_end: installment.period_end,
            expected_amount: expectedShareForSupplier(Number(installment.amount), effectiveSupplierId, lineItems),
          }
        : null;
      const issues = checkInstallmentInvoice(x, {
        installment: installmentForCheck,
        project: facts.project,
        supplierBudget: ledgerSupplier
          ? { budget: ledgerSupplier.budget.effective, alreadyInvoiced: ledgerSupplier.invoiced - (existing && existing.status !== "to_review" ? Number(existing.eligible_amount ?? existing.subtotal ?? 0) : 0), pendingInvoiced: pendingOthers }
          : null,
        filename: file.filename,
        supplierName: effectiveSupplierName,
        supplierMatchedByName: matchedByName,
        otherInvoices: expenses.filter((e) => e.id !== existing?.id),
        supplierId: effectiveSupplierId,
        today: todayIso(),
      });
      const note = draftClientNote(issues, x, { installment: installmentForCheck, filename: file.filename });

      if (existing) {
        await expensesRepo.updateReview(existing.id, { ...(installment ? { billing_installment_id: installment.id } : {}), review_issues: issues, review_note: note });
        return { status: "linked_existing", expenseId: existing.id, issues: issues.length, supplierName: effectiveSupplierName, amount: Number(existing.eligible_amount ?? existing.subtotal ?? existing.total ?? 0) || null };
      }

      if (!x.is_invoice) {
        // Pas une facture (ex. talon de paie, attestation) : rien n'est ajouté au tableau ; le
        // document est marqué « lu » pour ne pas être relu à chaque fois.
        return { status: "skipped", reason: "le document ne ressemble pas à une facture" };
      }

      const expense = await expensesRepo.create({
        organization_id: ctx.organizationId,
        grant_project_id: grantProjectId,
        supplier_id: supplier?.id ?? null,
        invoice_number: x.invoice_number,
        invoice_date: x.invoice_date,
        subtotal: amount,
        tax: x.tax,
        total: x.total,
        eligible_amount: amount,
        status: "to_review",
        source: "ai",
        billing_installment_id: installment?.id ?? null,
        review_issues: issues,
        review_note: note,
      });
      await documentsRepo.setInvoiceDocument(ctx.organizationId, expense.id, documentId);
      return { status: "created", expenseId: expense.id, issues: issues.length, supplierName: supplier?.name ?? null, amount };
    },

    async processInstallment(ctx: Ctx, installment: BillingInstallmentRow): Promise<IntakeResult> {
      const documentId = installment.client_invoice_document_id;
      if (!documentId) return { status: "skipped", reason: "aucune facture reçue sur ce versement" };
      return api.processDocument(ctx, installment.grant_project_id, documentId, installment);
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

    // Documents déposés par le client dans « Documents » du portail (0077), catégorie Facture ou
    // Autre, lisibles automatiquement (PDF/image), pas encore rattachés à une facture du tableau,
    // jamais lus -- ni reçus sur un versement (ceux-là passent par pendingInstallments).
    async pendingDocuments(grantProjectId: string): Promise<Array<{ id: string; filename: string }>> {
      const query = (columns: string) =>
        supabase.from("documents").select(columns).eq("grant_project_id", grantProjectId).eq("source", "client_portal").in("category", ["invoice", "other"]);
      // Sans la migration 0077, invoice_scan_at n'existe pas encore : on relit sans cette colonne.
      const docsQuery = query("id, filename, invoice_scan_at").then((r) => (r.error ? query("id, filename") : r));
      const [{ data, error }, installments, expenses] = await Promise.all([
        docsQuery,
        installmentsRepo.listByProject(grantProjectId),
        expensesRepo.listByProject(grantProjectId),
      ]);
      if (error) throw error;
      const docs = ((data ?? []) as unknown as Array<{ id: string; filename: string; invoice_scan_at?: string | null }>).filter((d) => !d.invoice_scan_at && analyzableMime(d.filename));
      if (docs.length === 0) return [];
      const installmentDocs = new Set(installments.map((i) => i.client_invoice_document_id).filter(Boolean));
      const links = expenses.length ? await documentsRepo.listInvoiceLinks(expenses.map((e) => e.id)) : [];
      const linkedDocs = new Set(links.map((l) => l.document_id));
      return docs.filter((d) => !installmentDocs.has(d.id) && !linkedDocs.has(d.id)).map((d) => ({ id: d.id, filename: d.filename }));
    },
  };
  return api;
}
