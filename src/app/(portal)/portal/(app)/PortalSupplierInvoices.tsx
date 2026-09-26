"use client";

// Factures fournisseurs d'un dossier, visibles du portail (0057) -- Jade : le client (enfant ET
// parent, via la hiérarchie) marque une facture « Envoyée, non payée » / « Payée », et ajoute une
// preuve de paiement une fois payée. Ne montre que les factures déjà confirmées par le personnel
// (voir portalDossiers.service.ts#PortalSupplierInvoice pour le raisonnement complet) -- le
// personnel peut faire le même changement depuis SuppliersTable.tsx (grants/[id]).
import { useState, useTransition } from "react";
import type { PortalSupplierInvoice } from "@/server/services/portalDossiers.service";
import { updatePortalInvoicePaymentStatusAction } from "./actions";
import { PortalOpenDocumentButton } from "./PortalOpenDocumentButton";
import { PaymentProofUpload } from "./PaymentProofUpload";

const PAYMENT_STATUS_LABELS: Record<string, string> = { sent_unpaid: "Envoyée, non payée", paid: "Payée" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA");
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("fr-CA", { minimumFractionDigits: 2 })} $`;
}

function InvoiceCard({ invoice }: { invoice: PortalSupplierInvoice }) {
  const [status, setStatus] = useState(invoice.paymentStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-neutral-100 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-neutral-900">
          {invoice.supplierName}
          {invoice.invoiceNumber && <span className="ml-2 font-normal text-neutral-500">N° {invoice.invoiceNumber}</span>}
        </span>
        <span className="text-neutral-800">{formatAmount(invoice.amount)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        {invoice.invoiceDate && <span>{formatDate(invoice.invoiceDate)}</span>}
        {invoice.document && <PortalOpenDocumentButton documentId={invoice.document.id} filename={invoice.document.filename} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          Statut de paiement
          <select
            value={status}
            disabled={isPending}
            onChange={(e) => {
              const next = e.target.value as PortalSupplierInvoice["paymentStatus"];
              setStatus(next);
              setError(null);
              startTransition(async () => {
                const r = await updatePortalInvoicePaymentStatusAction(invoice.id, next);
                if (r.error) {
                  setStatus(invoice.paymentStatus);
                  setError(r.error);
                }
              });
            }}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
          >
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {status === "paid" && (
        <div className="mt-2 border-t border-neutral-100 pt-2">
          <PaymentProofUpload expenseId={invoice.id} proof={invoice.paymentProof} />
        </div>
      )}
    </div>
  );
}

export function PortalSupplierInvoices({ invoices }: { invoices: PortalSupplierInvoice[] }) {
  if (invoices.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Factures fournisseurs</h3>
      <p className="text-xs text-neutral-400">
        Marque une facture « Payée » une fois réglée à ton fournisseur, et joins-en la preuve (reçu, virement...).
      </p>
      <div className="space-y-2">
        {invoices.map((inv) => (
          <InvoiceCard key={inv.id} invoice={inv} />
        ))}
      </div>
    </div>
  );
}
