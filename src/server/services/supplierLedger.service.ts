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
  claim: { claim_id: string; claimed_amount: number | null } | null; // réclamation où cette facture est réclamée
  // Jade (0057) : statut de PAIEMENT -- modifiable par le personnel ET le portail (enfant/parent).
  paymentStatus: "sent_unpaid" | "paid";
  paymentStatusUpdatedAt: string | null;
  paymentProof: { id: string; filename: string; storage_path: string } | null;
};

// Valeur effective = override manuel ?? valeur automatique ?? calcul de repli.
export type Tracked = {
  effective: number | null;
  auto: number | null; // valeur automatique conservée même si elle est remplacée
  override: number | null;
  mode: "manual" | "auto" | "calculated" | "none";
};

export type LedgerSupplier = ProjectSupplierRow & {
  invoices: LedgerInvoice[];
  invoiced: number;
  accepted: Tracked; // subvention acceptée
  claimed: Tracked; // réclamé à ce jour (auto = réclamations liées à ses factures)
  remaining: number | null; // subvention acceptée - réclamé
};

export type Ledger = {
  suppliers: LedgerSupplier[];
  unassigned: LedgerInvoice[]; // factures dont le fournisseur a été supprimé ou n'est pas encore choisi
  spent: number; // toutes les factures, avant taxes
  supplierBudgetTotal: number;
  totals: { budget: number; accepted: number; claimed: number; remaining: number };
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
    // `projectRate` (fraction) sert au calcul de repli de la subvention acceptée : budget x taux.
    async load(grantProjectId: string, projectRate: number | null = null): Promise<Ledger> {
      const [suppliers, expenses] = await Promise.all([suppliersRepo.listByProject(grantProjectId), expensesRepo.listByProject(grantProjectId)]);
      const [links, proofLinks] = await Promise.all([
        documentsRepo.listInvoiceLinks(expenses.map((e) => e.id)),
        documentsRepo.listPaymentProofLinks(expenses.map((e) => e.id)),
      ]);
      const docByExpense = new Map(links.map((l) => [l.expense_id, { id: l.document_id, filename: l.filename, storage_path: l.storage_path }]));
      const proofByExpense = new Map(proofLinks.map((l) => [l.expense_id, { id: l.document_id, filename: l.filename, storage_path: l.storage_path }]));

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
        claim: null,
        paymentStatus: e.payment_status ?? "sent_unpaid",
        paymentStatusUpdatedAt: e.payment_status_updated_at ?? null,
        paymentProof: proofByExpense.get(e.id) ?? null,
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

      // Réclamé automatiquement = montants réclamés (claim_expenses) sur les factures de chaque fournisseur.
      const claimedByExpense = new Map<string, number>();
      if (expenses.length > 0) {
        const { data: claimRows } = await supabase.from("claim_expenses").select("expense_id, claim_id, claimed_amount").in("expense_id", expenses.map((e) => e.id));
        const byId = new Map(invoices.map((i) => [i.id, i]));
        for (const r of (claimRows ?? []) as Array<{ expense_id: string; claim_id: string; claimed_amount: number | null }>) {
          claimedByExpense.set(r.expense_id, (claimedByExpense.get(r.expense_id) ?? 0) + (num(r.claimed_amount) ?? 0));
          const inv = byId.get(r.expense_id);
          if (inv) inv.claim = { claim_id: r.claim_id, claimed_amount: num(r.claimed_amount) };
        }
      }

      const ledgerSuppliers: LedgerSupplier[] = suppliers.map((s) => {
        const list = bySupplier.get(s.id) ?? [];
        const budget = num(s.budget_amount);
        const accAuto = num(s.accepted_subsidy_auto);
        const accOverride = num(s.accepted_subsidy_override);
        const fallback = budget != null && projectRate != null ? Math.round(budget * projectRate * 100) / 100 : null;
        const accepted: Tracked =
          accOverride != null ? { effective: accOverride, auto: accAuto ?? fallback, override: accOverride, mode: "manual" }
          : accAuto != null ? { effective: accAuto, auto: accAuto, override: null, mode: "auto" }
          : fallback != null ? { effective: fallback, auto: fallback, override: null, mode: "calculated" }
          : { effective: null, auto: null, override: null, mode: "none" };

        const claimAuto = Math.round(list.reduce((sum, i) => sum + (claimedByExpense.get(i.id) ?? 0), 0) * 100) / 100;
        const claimOverride = num(s.claimed_override);
        const claimed: Tracked =
          claimOverride != null ? { effective: claimOverride, auto: claimAuto, override: claimOverride, mode: "manual" }
          : { effective: claimAuto, auto: claimAuto, override: null, mode: "auto" };

        const remaining = accepted.effective != null ? Math.round((accepted.effective - (claimed.effective ?? 0)) * 100) / 100 : null;
        return { ...s, invoices: list, invoiced: list.reduce((sum, i) => sum + (i.amount ?? 0), 0), accepted, claimed, remaining };
      });
      const sumOf = (pick: (s: LedgerSupplier) => number | null) => Math.round(ledgerSuppliers.reduce((sum, s) => sum + (pick(s) ?? 0), 0) * 100) / 100;
      return {
        suppliers: ledgerSuppliers,
        unassigned,
        spent: invoices.reduce((sum, i) => sum + (i.amount ?? 0), 0),
        supplierBudgetTotal: suppliers.reduce((sum, s) => sum + (num(s.budget_amount) ?? 0), 0),
        totals: {
          budget: sumOf((s) => num(s.budget_amount)),
          accepted: sumOf((s) => s.accepted.effective),
          claimed: sumOf((s) => s.claimed.effective),
          remaining: sumOf((s) => s.remaining),
        },
      };
    },

    saveSupplier: (id: string, patch: Parameters<typeof suppliersRepo.update>[1]) => suppliersRepo.update(id, patch),

    // Modification manuelle d'une valeur suivie. value = null -> « revenir au calcul automatique » :
    // seul l'override est effacé, la valeur automatique n'a jamais été touchée.
    async setOverride(supplierId: string, field: "accepted" | "claimed", value: number | null, organizationUserId: string) {
      const stamp = value == null ? { by: null, at: null } : { by: organizationUserId, at: new Date().toISOString() };
      return suppliersRepo.update(
        supplierId,
        field === "accepted"
          ? { accepted_subsidy_override: value, accepted_subsidy_override_by: stamp.by, accepted_subsidy_override_at: stamp.at }
          : { claimed_override: value, claimed_override_by: stamp.by, claimed_override_at: stamp.at }
      );
    },
    removeSupplier: (id: string) => suppliersRepo.remove(id),

    // Déplace un fournisseur d'un cran (haut/bas). Les positions sont d'abord normalisées (0..n-1 dans l'ordre affiché)
    // puis les deux voisins sont échangés : marche aussi tant que toutes les positions valent encore 0.
    async moveSupplier(grantProjectId: string, supplierId: string, direction: "up" | "down") {
      const list = await suppliersRepo.listByProject(grantProjectId);
      const from = list.findIndex((s) => s.id === supplierId);
      const to = direction === "up" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= list.length) return false;
      const order = list.map((s) => s.id);
      [order[from], order[to]] = [order[to]!, order[from]!];
      for (const [index, id] of order.entries()) {
        const current = list.find((s) => s.id === id)!;
        if (current.position !== index) await suppliersRepo.update(id, { position: index });
      }
      return true;
    },

    // Lie une facture à UNE réclamation (ou la délie : claimId = null). « Réclamé à ce jour » du fournisseur est
    // calculé à partir de ces liens ; le total de chaque réclamation touchée est recalculé.
    async linkInvoiceToClaim(organizationId: string, expenseId: string, claimId: string | null, claimedAmount: number | null) {
      const { data: existing, error: readError } = await supabase.from("claim_expenses").select("claim_id").eq("expense_id", expenseId);
      if (readError) throw readError;
      const touched = new Set<string>(((existing ?? []) as Array<{ claim_id: string }>).map((r) => r.claim_id));

      const { error: delError } = await supabase.from("claim_expenses").delete().eq("expense_id", expenseId);
      if (delError) throw delError;

      if (claimId) {
        const { data: expense, error: expError } = await supabase.from("expenses").select("eligible_amount, subtotal, total").eq("id", expenseId).maybeSingle();
        if (expError) throw expError;
        const e = expense as { eligible_amount: number | null; subtotal: number | null; total: number | null } | null;
        const amount = claimedAmount ?? num(e?.eligible_amount) ?? num(e?.subtotal) ?? num(e?.total) ?? 0;
        const { error: insError } = await supabase.from("claim_expenses").insert({ organization_id: organizationId, claim_id: claimId, expense_id: expenseId, claimed_amount: amount });
        if (insError) throw insError;
        touched.add(claimId);
      }

      // Recalcul du montant réclamé de chaque réclamation touchée (somme de ses lignes).
      for (const id of touched) {
        const { data: rows, error } = await supabase.from("claim_expenses").select("claimed_amount").eq("claim_id", id);
        if (error) throw error;
        const total = Math.round(((rows ?? []) as Array<{ claimed_amount: number | null }>).reduce((sum, r) => sum + (num(r.claimed_amount) ?? 0), 0) * 100) / 100;
        const { error: upError } = await supabase.from("claims").update({ claimed_amount: total }).eq("id", id);
        if (upError) throw upError;
      }
    },

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
      await documentsRepo.setInvoiceDocument(organizationId, id, input.document_id);
      return id;
    },

    // Confirmer une facture lue automatiquement (enlève la mention « à vérifier »).
    confirmInvoice: (id: string) => expensesRepo.update(id, { status: "compliant" }),
    removeInvoice: (id: string) => expensesRepo.remove(id),

    // Statut de paiement (0057) : personnel ET portail (enfant/parent) -- l'appelant (action
    // admin ou portail) vérifie l'accès à SA façon avant d'appeler ceci.
    updatePaymentStatus: (expenseId: string, status: "sent_unpaid" | "paid", updatedBy: string | null) =>
      expensesRepo.updatePaymentStatus(expenseId, status, updatedBy),

    // Preuve de paiement (0057) : au plus un document par facture, remplace le lien existant.
    setPaymentProof: (organizationId: string, expenseId: string, documentId: string | null) =>
      documentsRepo.setPaymentProofDocument(organizationId, expenseId, documentId),

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
        supplier = await suppliersRepo.create({ organization_id: organizationId, grant_project_id: grantProjectId, name, source_kind: "ai", source_document_id: documentId, source_ref: "facture", extracted_at: new Date().toISOString(), confidence: "medium" });
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
      await documentsRepo.setInvoiceDocument(organizationId, expense.id, documentId);
      return { status: "recorded", supplierName: supplier.name, supplierCreated, amount };
    },
  };
}
