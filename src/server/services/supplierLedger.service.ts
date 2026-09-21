import type { SupabaseClient } from "@supabase/supabase-js";
import { projectSuppliersRepository, type ProjectSupplierRow } from "@/server/repositories/projectSuppliers.repository";
import { expensesRepository, type ExpenseRow } from "@/server/repositories/expenses.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { matchSupplier } from "@/features/invoices/matchSupplier";
import { amountBeforeTax, type InvoiceExtraction } from "@/features/invoices/analyzeInvoice";

// Tableau fournisseurs d'un dossier : fournisseurs + leurs factures (document, date, montant).

export type LedgerInvoice = {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number | null; // avant taxes : c'est ce qui compte pour la subvention
  total: number | null;
  status: string;
  source: "manual" | "ai";
  document: { id: string; filename: string; storage_path: string } | null;
};

export type LedgerSupplier = ProjectSupplierRow & { invoices: LedgerInvoice[]; invoiced: number };

export type Ledger = {
  suppliers: LedgerSupplier[];
  unassigned: LedgerInvoice[]; // factures dont le fournisseur a été supprimé ou n'est pas encore choisi
  spent: number; // toutes les factures, avant taxes
  supplierBudgetTotal: number;
};

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const invoiceAmount = (e: ExpenseRow) => num(e.eligible_amount) ?? num(e.subtotal) ?? num(e.total);

export type SaveInvoiceInput = {
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number | null; // avant taxes
  document_id: string | null;
};

export function supplierLedgerService(supabase: SupabaseClient) {
  const suppliersRepo = projectSuppliersRepository(supabase);
  const expensesRepo = expensesRepository(supabase);
  const documentsRepo = documentsRepository(supabase);

  return {
    async load(grantProjectId: string): Promise<Ledger> {
      const [suppliers, expenses] = await Promise.all([suppliersRepo.listByProject(grantProjectId), expensesRepo.listByProject(grantProjectId)]);
      const links = await documentsRepo.listInvoiceLinks(expenses.map((e) => e.id));
      const docByExpense = new Map(links.map((l) => [l.expense_id, { id: l.document_id, filename: l.filename, storage_path: l.storage_path }]));

      const invoices: LedgerInvoice[] = expenses.map((e) => ({
        id: e.id,
        supplier_id: e.supplier_id,
        invoice_number: e.invoice_number,
        invoice_date: e.invoice_date,
        amount: invoiceAmount(e),
        total: num(e.total),
        status: e.status,
        source: e.source ?? "manual",
        document: docByExpense.get(e.id) ?? null,
      }));

      const bySupplier = new Map<string, LedgerInvoice[]>();
      const unassigned: LedgerInvoice[] = [];
      for (const inv of invoices) {
        if (inv.supplier_id && suppliers.some((s) => s.id === inv.supplier_id)) {
          const list = bySupplier.get(inv.supplier_id) ?? [];
          list.push(inv);
          bySupplier.set(inv.supplier_id, list);
        } else unassigned.push(inv);
      }

      const ledgerSuppliers: LedgerSupplier[] = suppliers.map((s) => {
        const list = bySupplier.get(s.id) ?? [];
        return { ...s, invoices: list, invoiced: list.reduce((sum, i) => sum + (i.amount ?? 0), 0) };
      });
      return {
        suppliers: ledgerSuppliers,
        unassigned,
        spent: invoices.reduce((sum, i) => sum + (i.amount ?? 0), 0),
        supplierBudgetTotal: suppliers.reduce((sum, s) => sum + (num(s.budget_amount) ?? 0), 0),
      };
    },

    saveSupplier: (id: string, patch: Parameters<typeof suppliersRepo.update>[1]) => suppliersRepo.update(id, patch),
    removeSupplier: (id: string) => suppliersRepo.remove(id),

    async saveInvoice(organizationId: string, grantProjectId: string, expenseId: string | null, input: SaveInvoiceInput) {
      const amounts = { subtotal: input.amount, eligible_amount: input.amount };
      let id = expenseId;
      if (id) {
        await expensesRepo.update(id, { supplier_id: input.supplier_id, invoice_number: input.invoice_number, invoice_date: input.invoice_date, ...amounts });
      } else {
        const created = await expensesRepo.create({
          organization_id: organizationId,
          grant_project_id: grantProjectId,
          supplier_id: input.supplier_id,
          invoice_number: input.invoice_number,
          invoice_date: input.invoice_date,
          ...amounts,
          status: "compliant", // saisie à la main : déjà vue par l'utilisateur
          source: "manual",
        });
        id = created.id;
      }
      await documentsRepo.setInvoiceDocument(id, input.document_id);
      return id;
    },

    // Confirmer une facture lue automatiquement (enlève la mention « à vérifier »).
    confirmInvoice: (id: string) => expensesRepo.update(id, { status: "compliant" }),
    removeInvoice: (id: string) => expensesRepo.remove(id),

    // Facture lue automatiquement : la range sous le bon fournisseur (créé s'il est nouveau), sans
    // doublon (même fournisseur + même numéro + même total), marquée « à vérifier ».
    async recordAnalyzedInvoice(
      organizationId: string,
      grantProjectId: string,
      documentId: string,
      x: InvoiceExtraction
    ): Promise<{ status: "recorded" | "duplicate"; supplierName: string; supplierCreated: boolean; amount: number | null }> {
      const suppliers = await suppliersRepo.listByProject(grantProjectId);
      const name = x.supplier_name ?? "Fournisseur à identifier";
      let supplier = x.supplier_name ? matchSupplier(x.supplier_name, suppliers) : null;
      let supplierCreated = false;
      if (!supplier) {
        supplier = await suppliersRepo.create({ organization_id: organizationId, grant_project_id: grantProjectId, name });
        supplierCreated = true;
      }

      const amount = amountBeforeTax(x);
      if (x.invoice_number) {
        const existing = await expensesRepo.listByProject(grantProjectId);
        const dup = existing.find((e) => e.supplier_id === supplier!.id && e.invoice_number === x.invoice_number && num(e.total) === x.total);
        if (dup) return { status: "duplicate", supplierName: supplier.name, supplierCreated, amount };
      }

      const expense = await expensesRepo.create({
        organization_id: organizationId,
        grant_project_id: grantProjectId,
        supplier_id: supplier.id,
        invoice_number: x.invoice_number,
        invoice_date: x.invoice_date,
        subtotal: amount,
        tax: x.tax,
        total: x.total,
        eligible_amount: amount,
        status: "to_review",
        source: "ai",
      });
      await documentsRepo.setInvoiceDocument(expense.id, documentId);
      return { status: "recorded", supplierName: supplier.name, supplierCreated, amount };
    },
  };
}
