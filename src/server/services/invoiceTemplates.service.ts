import type { SupabaseClient } from "@supabase/supabase-js";
import { DocxTemplate } from "@/lib/docxTemplate";
import { invoiceTagValues, invoiceTotals, type InvoiceDraftValues } from "@/features/invoices/invoiceTemplateFields";
import type { InvoiceExtraction } from "@/features/invoices/analyzeInvoice";

// Modèle de facture d'un client/fournisseur (0079, Jade) et brouillon de la facture de chaque
// versement. `supabase` : client admin pour les écritures du portail (accès vérifié avant).

const BUCKET = "apex-documents";

export type InvoiceTemplateRow = {
  id: string;
  organization_id: string;
  client_id: string;
  document_id: string;
  original_document_id: string | null;
  tags: string[];
  updated_at: string;
};

export type InvoiceDraftRow = {
  installment_id: string;
  issuer_client_id: string;
  organization_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  client_name: string | null;
  client_address: string | null;
  description: string | null;
  amount: number | string | null;
  apply_gst: boolean;
  apply_qst: boolean;
  sent_document_id: string | null;
  updated_at: string;
};

const missingTable = (e: { message?: string } | null, table: string) => !!e && new RegExp(table).test(e.message ?? "");

export function invoiceTemplatesService(supabase: SupabaseClient) {
  return {
    /** Modèle du client, ou null (aucun, ou migration 0079 pas encore passée). */
    async getForClient(clientId: string): Promise<(InvoiceTemplateRow & { filename: string | null }) | null> {
      const { data, error } = await supabase.from("invoice_templates").select("*").eq("client_id", clientId).maybeSingle();
      if (error || !data) return null;
      const row = data as InvoiceTemplateRow;
      const { data: doc } = await supabase.from("documents").select("filename").eq("id", row.original_document_id ?? row.document_id).maybeSingle();
      return { ...row, filename: (doc as { filename: string } | null)?.filename ?? null };
    },

    async save(input: { organizationId: string; clientId: string; documentId: string; originalDocumentId: string | null; tags: string[]; updatedBy: string | null }) {
      const { error } = await supabase.from("invoice_templates").upsert(
        {
          organization_id: input.organizationId,
          client_id: input.clientId,
          document_id: input.documentId,
          original_document_id: input.originalDocumentId,
          tags: input.tags,
          updated_by: input.updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" }
      );
      if (error) {
        if (missingTable(error, "invoice_templates")) throw new Error("Le modèle de facture n'est pas encore activé : la migration 0079 doit être passée dans Supabase.");
        throw error;
      }
    },

    async getDraft(installmentId: string, issuerClientId: string): Promise<InvoiceDraftRow | null> {
      const { data, error } = await supabase.from("installment_invoice_drafts").select("*").eq("installment_id", installmentId).eq("issuer_client_id", issuerClientId).maybeSingle();
      if (error) return null;
      return (data as InvoiceDraftRow | null) ?? null;
    },

    /** Dernière adresse de client saisie par cet émetteur sur un autre versement du même dossier. */
    async lastClientAddress(installmentIds: string[], issuerClientId: string): Promise<string | null> {
      if (installmentIds.length === 0) return null;
      const { data, error } = await supabase
        .from("installment_invoice_drafts")
        .select("client_address, updated_at")
        .eq("issuer_client_id", issuerClientId)
        .in("installment_id", installmentIds)
        .not("client_address", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) return null;
      return ((data ?? [])[0] as { client_address: string | null } | undefined)?.client_address ?? null;
    },

    async saveDraft(row: Omit<InvoiceDraftRow, "updated_at" | "sent_document_id"> & { sent_document_id?: string | null; updated_by: string | null }) {
      const { error } = await supabase.from("installment_invoice_drafts").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "installment_id,issuer_client_id" });
      if (error) {
        if (missingTable(error, "installment_invoice_drafts")) throw new Error("Le modèle de facture n'est pas encore activé : la migration 0079 doit être passée dans Supabase.");
        throw error;
      }
    },

    /** Remplit le modèle du client avec les valeurs de la facture. */
    async render(template: InvoiceTemplateRow, values: InvoiceDraftValues): Promise<Buffer> {
      const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", template.document_id).maybeSingle();
      const path = (doc as { storage_path: string } | null)?.storage_path;
      if (!path) throw new Error("Modèle de facture introuvable : téléversez-le de nouveau.");
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !blob) throw new Error("Modèle de facture introuvable dans le stockage : téléversez-le de nouveau.");
      const tpl = new DocxTemplate(await blob.arrayBuffer());
      tpl.fill(invoiceTagValues(values));
      return tpl.toBuffer();
    },
  };
}

/** Ce qu'Apex sait d'une facture générée -- utilisé au lieu d'une lecture automatique. */
export function extractionFromDraft(values: InvoiceDraftValues, issuerName: string): InvoiceExtraction {
  const t = invoiceTotals(values);
  return {
    is_invoice: true,
    supplier_name: issuerName,
    invoice_number: values.invoiceNumber || null,
    invoice_date: values.invoiceDate || null,
    currency: "CAD",
    subtotal: values.amount,
    tax: t.taxes,
    total: t.total,
    description: values.description || null,
    billed_to_name: values.clientName || null,
    concordance_issues: [],
  };
}
