import type { SupabaseClient } from "@supabase/supabase-js";
import { expensesRepository, type ExpenseRow } from "@/server/repositories/expenses.repository";
import { billingInstallmentsRepository, type BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import { documentsRepository } from "@/server/repositories/documents.repository";
import { portalInvoiceIntakeService, type IntakeResult } from "@/server/services/portalInvoiceIntake.service";

// « Remplacer » une facture (Jade) : le fournisseur corrige sa facture (ex. Sitegrow, à la demande
// d'Apex) et le client -- ou le personnel -- téléverse la nouvelle version À LA PLACE de l'ancienne :
//  - le nouveau fichier devient le document de la facture (tableau Fournisseurs) et, le cas
//    échéant, la facture reçue sur le versement (Aide à la facturation) ;
//  - la ligne du tableau est relue automatiquement (n°, date, montants mis à jour) et repasse
//    « à vérifier » : elle ne compte plus dans les totaux tant qu'Apex ne l'a pas confirmée ;
//  - l'ancienne version n'est jamais effacée : elle reste dans les documents du dossier, renommée
//    « Remplacée — … » et marquée lue (elle ne sera pas reprise comme nouvelle facture).
// Le statut de paiement et la preuve de paiement de la facture sont conservés.
//
// L'appelant vérifie l'accès AVANT (RLS du portail ou du personnel) ; `supabase` est le client
// qui écrit (admin pour le portail, client du personnel sinon).

const BUCKET = "apex-documents";
export const REPLACED_PREFIX = "Remplacée — ";

export type ReplaceInvoiceResult = {
  documentId: string;
  expenseId: string | null;
  oldFilenames: string[];
  read: IntakeResult | null;
};

export async function replaceInvoiceFile(
  supabase: SupabaseClient,
  p: {
    organizationId: string;
    grantProjectId: string;
    clientId: string;
    expenseId: string | null; // ligne du tableau Fournisseurs à remplacer
    installmentId: string | null; // ou facture reçue sur ce versement
    file: File;
    uploadedBy: string | null; // organization_users.id
    source: "client_portal" | "manual";
  }
): Promise<ReplaceInvoiceResult> {
  const expensesRepo = expensesRepository(supabase);
  const installmentsRepo = billingInstallmentsRepository(supabase);
  const documentsRepo = documentsRepository(supabase);

  const [expenses, installments] = await Promise.all([expensesRepo.listByProject(p.grantProjectId), installmentsRepo.listByProject(p.grantProjectId)]);
  const links = expenses.length ? await documentsRepo.listInvoiceLinks(expenses.map((e) => e.id)) : [];
  const docOfExpense = (id: string) => links.find((l) => l.expense_id === id)?.document_id ?? null;

  let installment: BillingInstallmentRow | null = p.installmentId ? (installments.find((i) => i.id === p.installmentId) ?? null) : null;
  if (p.installmentId && !installment) throw new Error("Versement introuvable dans ce dossier.");
  let expense: ExpenseRow | null = p.expenseId ? (expenses.find((e) => e.id === p.expenseId) ?? null) : null;
  if (p.expenseId && !expense) throw new Error("Facture introuvable dans ce dossier.");

  // Facture reçue sur un versement : la ligne du tableau qui en vient (même document, sinon la
  // seule facture liée à ce versement).
  if (!expense && installment) {
    const docId = installment.client_invoice_document_id;
    const byDoc = docId ? expenses.find((e) => docOfExpense(e.id) === docId) : undefined;
    const byInstallment = expenses.filter((e) => e.billing_installment_id === installment!.id);
    expense = byDoc ?? (byInstallment.length === 1 ? byInstallment[0]! : null);
  }
  // Ligne du tableau : le versement dont elle est la facture reçue du portail.
  if (expense && !installment) {
    const docId = docOfExpense(expense.id);
    installment = docId ? (installments.find((i) => i.client_invoice_document_id === docId) ?? null) : null;
  }

  const oldDocIds = [...new Set([installment?.client_invoice_document_id, expense ? docOfExpense(expense.id) : null].filter((id): id is string => !!id))];

  // 1. Nouveau fichier.
  const path = `${p.organizationId}/${p.clientId}/${Date.now()}-${p.file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, p.file, { contentType: p.file.type || undefined, upsert: false });
  if (uploadError) throw uploadError;
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      organization_id: p.organizationId,
      filename: p.file.name,
      storage_path: path,
      mime_type: p.file.type || null,
      size: p.file.size || null,
      category: "invoice",
      client_id: p.clientId,
      grant_project_id: p.grantProjectId,
      uploaded_by: p.uploadedBy,
      source: p.source,
    })
    .select("id")
    .single();
  if (docError) throw docError;
  const documentId = (doc as { id: string }).id;

  // 2. Il prend la place de l'ancien.
  if (installment) {
    installment = await installmentsRepo.update(installment.id, {
      client_invoice_document_id: documentId,
      client_invoice_uploaded_at: new Date().toISOString(),
      client_invoice_uploaded_by: p.uploadedBy,
    });
  }
  if (expense) {
    await documentsRepo.setInvoiceDocument(p.organizationId, expense.id, documentId);
    await expensesRepo.update(expense.id, { status: "to_review" });
  }

  // 3. Ancienne version : conservée, renommée et marquée lue.
  const oldFilenames: string[] = [];
  if (oldDocIds.length) {
    const { data: oldDocs } = await supabase.from("documents").select("id, filename").in("id", oldDocIds);
    for (const d of (oldDocs ?? []) as Array<{ id: string; filename: string }>) {
      oldFilenames.push(d.filename.replace(REPLACED_PREFIX, ""));
      const filename = d.filename.startsWith(REPLACED_PREFIX) ? d.filename : `${REPLACED_PREFIX}${d.filename}`;
      const now = new Date().toISOString();
      const { error } = await supabase.from("documents").update({ filename, invoice_scan_at: now, invoice_scan_result: "not_invoice" }).eq("id", d.id);
      // Sans la migration 0077, les colonnes invoice_scan_* n'existent pas : on renomme seulement.
      if (error) await supabase.from("documents").update({ filename }).eq("id", d.id);
    }
  }

  // 4. Relecture de la nouvelle version (best-effort : le fichier est déjà remplacé).
  let read: IntakeResult | null = null;
  try {
    const intake = portalInvoiceIntakeService(supabase);
    if (expense) {
      const inst = installment ?? (expense.billing_installment_id ? (installments.find((i) => i.id === expense!.billing_installment_id) ?? null) : null);
      read = await intake.processDocument({ organizationId: p.organizationId }, p.grantProjectId, documentId, inst, { replaceExpenseId: expense.id });
    } else if (installment) {
      read = await intake.processInstallment({ organizationId: p.organizationId }, installment);
    }
  } catch {
    read = null;
  }

  return { documentId, expenseId: expense?.id ?? (read && read.status !== "skipped" ? read.expenseId : null), oldFilenames, read };
}
