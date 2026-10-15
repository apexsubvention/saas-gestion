// Contrôle d'une facture reçue du portail pour UN versement de facturation (0073, Jade).
//
// Fonction pure (aucun accès base/API) : compare ce qui a été LU sur la facture (analyzeInvoice.ts)
// à ce qui était PRÉVU pour ce versement (Aide à la facturation) et au reste du dossier, puis
// produit (1) la liste des incohérences et (2) un brouillon de note au client, prêt à envoyer dans
// le fil de notes du dossier côté portail. Rien n'est bloquant : la facture est toujours ajoutée au
// tableau (statut « à vérifier ») -- les incohérences servent à décider quoi approuver ou demander.
import { amountBeforeTax, type InvoiceExtraction } from "./analyzeInvoice";
import { matchSupplier } from "./matchSupplier";

export type ReviewIssue = { code: string; message: string };

export type InstallmentForCheck = {
  installment_number: number;
  period_start: string;
  period_end: string;
  // Montant prévu pour CE fournisseur sur ce versement (déjà ramené à sa part s'il y a plusieurs
  // fournisseurs facturants -- voir expectedShareForSupplier ci-dessous). null = inconnu.
  expected_amount: number | null;
};

export type CheckContext = {
  // null (0077) : facture déposée dans « Documents » du portail, sans versement précis -- les
  // contrôles liés au versement (montant prévu, période) sont alors remplacés par le budget du
  // fournisseur (supplierBudget ci-dessous).
  installment: InstallmentForCheck | null;
  // Projet (0078) : période où la facture doit tomber (période de dépenses admissibles de la
  // convention, sinon début/fin du projet) et nom(s) acceptés pour l'entreprise facturée.
  project?: {
    periodStart: string | null;
    periodEnd: string | null;
    periodLabel: string; // « la période de dépenses admissibles » / « le projet »
    clientNames: string[];
  } | null;
  // Budget prévu du fournisseur et ce qui lui est déjà facturé (factures approuvées) -- null = inconnu.
  supplierBudget?: { budget: number | null; alreadyInvoiced: number; pendingInvoiced?: number } | null;
  filename: string;
  // Fournisseur retenu dans le tableau, et s'il a été reconnu d'après le nom lu sur la facture.
  supplierName: string | null;
  supplierMatchedByName: boolean;
  // Autres factures du dossier (pour repérer un numéro déjà utilisé).
  otherInvoices: Array<{ supplier_id: string | null; invoice_number: string | null }>;
  supplierId: string | null;
  today: string; // AAAA-MM-JJ
};

const AMOUNT_TOLERANCE = 1; // $ -- arrondis
const fmt = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
const normNumber = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+/, "");

/**
 * Part d'un fournisseur dans le montant d'un versement : si plusieurs fournisseurs ont des postes
 * « À facturer », le versement couvre tout le monde -- on compare alors la facture à la part de CE
 * fournisseur (au prorata de ses postes), jamais au montant total du versement.
 */
export function expectedShareForSupplier(
  installmentAmount: number | null,
  supplierId: string | null,
  lineItems: Array<{ supplier_id: string | null; amount: number | null; included_in_billing: boolean }>
): number | null {
  if (installmentAmount == null) return null;
  const billable = lineItems.filter((it) => it.included_in_billing);
  const total = billable.reduce((s, it) => s + Number(it.amount ?? 0), 0);
  const suppliersWithItems = new Set(billable.map((it) => it.supplier_id).filter(Boolean));
  if (suppliersWithItems.size <= 1 || total <= 0 || !supplierId) return installmentAmount;
  const mine = billable.filter((it) => it.supplier_id === supplierId).reduce((s, it) => s + Number(it.amount ?? 0), 0);
  if (mine <= 0) return installmentAmount;
  return Math.round(installmentAmount * (mine / total) * 100) / 100;
}

export function checkInstallmentInvoice(x: InvoiceExtraction, ctx: CheckContext): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const { installment } = ctx;

  if (!x.is_invoice) {
    issues.push({ code: "not_invoice", message: "Le document envoyé ne semble pas être une facture (soumission, relevé ou reçu ?)." });
    return issues; // le reste n'a pas de sens
  }

  if (!x.invoice_number) {
    issues.push({ code: "number_missing", message: "Le numéro de facture n'est pas lisible ou absent du document." });
  } else {
    const wanted = normNumber(x.invoice_number);
    const dup = ctx.otherInvoices.some((e) => e.invoice_number && normNumber(e.invoice_number) === wanted && (ctx.supplierId == null || e.supplier_id === ctx.supplierId));
    if (dup) issues.push({ code: "number_duplicate", message: `Le numéro de facture ${x.invoice_number} est déjà utilisé par une autre facture de ce dossier.` });
  }

  if (!x.supplier_name) {
    issues.push({ code: "supplier_missing", message: "Le nom de l'entreprise qui émet la facture n'est pas lisible." });
  } else if (!ctx.supplierMatchedByName) {
    issues.push({
      code: "supplier_unknown",
      message: ctx.supplierName
        ? `La facture est émise par « ${x.supplier_name} », qui ne correspond pas au fournisseur prévu au dossier (${ctx.supplierName}).`
        : `La facture est émise par « ${x.supplier_name} », qui ne correspond à aucun fournisseur prévu au dossier.`,
    });
  }

  const amount = amountBeforeTax(x);
  if (amount == null) {
    issues.push({ code: "amount_missing", message: "Le montant avant taxes n'est pas lisible (ni sous-total, ni taxes séparées)." });
  } else if (installment && installment.expected_amount != null && Math.abs(amount - installment.expected_amount) > AMOUNT_TOLERANCE) {
    issues.push({
      code: "amount_mismatch",
      message: `Le montant avant taxes de la facture (${fmt(amount)}) ne correspond pas au montant prévu pour le versement ${installment.installment_number} (${fmt(installment.expected_amount)}).`,
    });
  }

  // Budget du fournisseur (0077) : cette facture, ajoutée à ce qui est déjà facturé (et à celles
  // qui attendent aussi une approbation), dépasse-t-elle son Budget prévu ?
  const b = ctx.supplierBudget;
  if (amount != null && b && b.budget != null && b.budget > 0) {
    const after = Math.round((b.alreadyInvoiced + (b.pendingInvoiced ?? 0) + amount) * 100) / 100;
    if (after - b.budget > AMOUNT_TOLERANCE) {
      issues.push({
        code: "over_budget",
        message: `Avec cette facture (${fmt(amount)} avant taxes), le total facturé par ${ctx.supplierName ?? "ce fournisseur"} atteindrait ${fmt(after)}, au-delà du budget prévu de ${fmt(b.budget)} (dépassement de ${fmt(after - b.budget)}, non subventionné).`,
      });
    }
  }

  if (x.subtotal != null && x.tax != null && x.total != null && Math.abs(x.subtotal + x.tax - x.total) > AMOUNT_TOLERANCE) {
    issues.push({
      code: "tax_sum",
      message: `Les montants ne s'additionnent pas : ${fmt(x.subtotal)} + ${fmt(x.tax)} de taxes ≠ ${fmt(x.total)} au total.`,
    });
  }

  if (x.currency && x.currency.toUpperCase() !== "CAD") {
    issues.push({ code: "currency", message: `La facture est en ${x.currency.toUpperCase()} plutôt qu'en dollars canadiens.` });
  }

  if (!x.invoice_date) {
    issues.push({ code: "date_missing", message: "La date de la facture n'est pas lisible." });
  } else if (installment && x.invoice_date < installment.period_start) {
    issues.push({
      code: "date_before_period",
      message: `La facture est datée du ${x.invoice_date}, avant le début de la période couverte par le versement ${installment.installment_number} (${installment.period_start} au ${installment.period_end}).`,
    });
  } else if (x.invoice_date > ctx.today) {
    issues.push({ code: "date_future", message: `La facture est datée du ${x.invoice_date}, une date future.` });
  }

  // Période du projet (0078) : la facture doit être datée entre le début et la fin.
  const proj = ctx.project;
  if (proj && x.invoice_date) {
    const range = `${proj.periodStart ?? "…"} au ${proj.periodEnd ?? "…"}`;
    if (proj.periodStart && x.invoice_date < proj.periodStart && !issues.some((i) => i.code === "date_before_period")) {
      issues.push({ code: "date_before_project", message: `La facture est datée du ${x.invoice_date}, avant le début de ${proj.periodLabel} (${range}) : la dépense pourrait ne pas être admissible.` });
    } else if (proj.periodEnd && x.invoice_date > proj.periodEnd) {
      issues.push({ code: "date_after_project", message: `La facture est datée du ${x.invoice_date}, après la fin de ${proj.periodLabel} (${range}) : la dépense pourrait ne pas être admissible.` });
    }
  }

  // Entreprise facturée (0078) : la facture doit être adressée au client du dossier.
  if (proj && x.billed_to_name && proj.clientNames.length > 0) {
    const known = proj.clientNames.map((name, i) => ({ id: String(i), name }));
    if (!matchSupplier(x.billed_to_name, known)) {
      issues.push({ code: "billed_to", message: `La facture est adressée à « ${x.billed_to_name} », alors que le dossier est au nom de ${proj.clientNames[0]}.` });
    }
  }

  // Contenu (0078) : écarts relevés entre la facture et le projet déposé/accepté (convention,
  // activités acceptées, budget déposé, mentions exigées) -- lus par Claude, à double vérifier.
  (x.concordance_issues ?? []).forEach((message, i) => issues.push({ code: `content_${i + 1}`, message: `À vérifier avec le projet déposé : ${message}` }));

  return issues;
}

/** Brouillon de note au client (vouvoiement), modifiable avant envoi. null s'il n'y a rien à signaler. */
export function draftClientNote(issues: ReviewIssue[], x: Pick<InvoiceExtraction, "invoice_number">, ctx: Pick<CheckContext, "installment" | "filename">): string | null {
  if (issues.length === 0) return null;
  const { installment } = ctx;
  const which = x.invoice_number ? `votre facture n° ${x.invoice_number} (${ctx.filename})` : `votre facture (${ctx.filename})`;
  const lines = [
    "Bonjour,",
    "",
    `Nous avons bien reçu ${which}${installment ? ` pour le versement ${installment.installment_number} (période du ${installment.period_start} au ${installment.period_end})` : ""}. Avant de la traiter, pourriez-vous vérifier ${issues.length > 1 ? "les points suivants" : "le point suivant"} :`,
    "",
    ...issues.map((i) => `- ${i.message}`),
    "",
    installment
      ? "Si c'est voulu, répondez-nous simplement ici. Sinon, nous réactiverons l'envoi d'une facture corrigée sur ce versement dans votre portail."
      : "Si c'est voulu, répondez-nous simplement ici. Sinon, vous pouvez déposer une facture corrigée dans la section Documents de votre portail.",
    "",
    "Merci !",
  ];
  return lines.join("\n");
}
