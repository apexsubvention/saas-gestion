// Champs d'une facture générée à partir du modèle Word d'un fournisseur (Jade, ex. Sitegrow) et du
// plan de facturation. Fonctions pures -- partagées par le portail (formulaire), la préparation
// automatique du modèle (Claude) et le remplissage (docxTemplate.ts).

export const INVOICE_TEMPLATE_FIELDS = [
  { tag: "numero_facture", label: "Numéro de facture", hint: "« Facture n° », « No » -- saisi par le fournisseur" },
  { tag: "date_facture", label: "Date de la facture", hint: "« Date », « Date de facturation »" },
  { tag: "echeance", label: "Échéance", hint: "« Échéance », « Payable le », « Date d'échéance »" },
  { tag: "client", label: "Facturé à (nom)", hint: "nom de l'entreprise facturée, « Facturé à », « Client »" },
  { tag: "client_adresse", label: "Adresse du client", hint: "adresse sous le nom du client facturé" },
  { tag: "projet", label: "Projet", hint: "nom du projet / de la subvention" },
  { tag: "versement", label: "Versement", hint: "numéro du versement du plan de facturation" },
  { tag: "periode", label: "Période", hint: "période couverte (du … au …)" },
  { tag: "description", label: "Description des travaux", hint: "zone de description des services / travaux effectués" },
  { tag: "montant", label: "Montant avant taxes", hint: "« Sous-total », montant de la ligne" },
  { tag: "tps", label: "TPS", hint: "« TPS », « GST » (5 %)" },
  { tag: "tvq", label: "TVQ", hint: "« TVQ », « QST » (9,975 %)" },
  { tag: "taxes", label: "Total des taxes", hint: "total des taxes, si une seule ligne de taxes" },
  { tag: "total", label: "Total", hint: "« Total », « Montant total », « Total à payer »" },
] as const;

export type InvoiceTemplateTag = (typeof INVOICE_TEMPLATE_FIELDS)[number]["tag"];
export const INVOICE_TEMPLATE_TAGS: readonly string[] = INVOICE_TEMPLATE_FIELDS.map((f) => f.tag);

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export type InvoiceDraftValues = {
  invoiceNumber: string;
  invoiceDate: string; // AAAA-MM-JJ
  dueDate: string; // AAAA-MM-JJ
  clientName: string;
  clientAddress: string;
  projectName: string;
  installmentNumber: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  description: string;
  amount: number; // avant taxes
  applyGst: boolean;
  applyQst: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function invoiceTotals(v: Pick<InvoiceDraftValues, "amount" | "applyGst" | "applyQst">) {
  const gst = v.applyGst ? round2(v.amount * GST_RATE) : 0;
  const qst = v.applyQst ? round2(v.amount * QST_RATE) : 0;
  return { gst, qst, taxes: round2(gst + qst), total: round2(v.amount + gst + qst) };
}

export const formatInvoiceMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « 2026-10-19 » -> « 19 octobre 2026 » (sans fuseau horaire). */
export function formatInvoiceDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m! - 1]} ${y}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Valeur de chaque balise du modèle. */
export function invoiceTagValues(v: InvoiceDraftValues): Record<InvoiceTemplateTag, string> {
  const t = invoiceTotals(v);
  return {
    numero_facture: v.invoiceNumber,
    date_facture: formatInvoiceDate(v.invoiceDate),
    echeance: formatInvoiceDate(v.dueDate),
    client: v.clientName,
    client_adresse: v.clientAddress,
    projet: v.projectName,
    versement: v.installmentNumber != null ? String(v.installmentNumber) : "",
    periode: v.periodStart && v.periodEnd ? `du ${formatInvoiceDate(v.periodStart)} au ${formatInvoiceDate(v.periodEnd)}` : "",
    description: v.description,
    montant: formatInvoiceMoney(v.amount),
    tps: formatInvoiceMoney(t.gst),
    tvq: formatInvoiceMoney(t.qst),
    taxes: formatInvoiceMoney(t.taxes),
    total: formatInvoiceMoney(t.total),
  };
}

/** Nom de fichier de la facture générée : « Facture 2401 - Kolegz - versement 2.docx ». */
export function generatedInvoiceFilename(v: Pick<InvoiceDraftValues, "invoiceNumber" | "clientName" | "installmentNumber">) {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  const parts = [`Facture ${clean(v.invoiceNumber) || "sans numéro"}`, clean(v.clientName), v.installmentNumber != null ? `versement ${v.installmentNumber}` : ""].filter(Boolean);
  return `${parts.join(" - ").slice(0, 120)}.docx`;
}
