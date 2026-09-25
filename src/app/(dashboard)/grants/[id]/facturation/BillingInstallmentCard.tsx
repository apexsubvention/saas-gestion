"use client";

// Un versement de facturation = une carte éditable : texte suggéré pour la facture (activités/modules
// couverts, heures si pertinent) + montant (réparti automatiquement sur le total des activités,
// jamais inventé par l'IA). Bouton « copier » (à coller dans la facture du client) -- même mécanisme
// que les DDR (DdrReportCard.tsx) et l'aide à la rédaction. Tout reste modifiable, y compris ce
// qu'Apex a rédigé ou réparti automatiquement.
import { useState, useTransition } from "react";
import type { BillingInstallmentRow } from "@/server/repositories/billingInstallments.repository";
import type { DocumentRow } from "@/server/repositories/documents.repository";
import { updateBillingInstallmentAction, deleteBillingInstallmentAction, setBillingInstallmentStatusAction, clearInstallmentClientInvoiceAction } from "./actions";
import { OpenDocumentButton } from "../OpenDocumentButton";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const textarea = `${input} min-h-[6rem]`;
const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* copie manuelle si l'API presse-papier est indisponible */
        }
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
    >
      {copied ? "Copié ✓" : "Copier"}
    </button>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function BillingInstallmentCard({
  grantProjectId,
  installment,
  clientInvoiceDocument,
}: {
  grantProjectId: string;
  installment: BillingInstallmentRow;
  // Facture téléversée par le client depuis le portail (0054) -- null si aucune (colonne
  // client_invoice_document_id vide) ou si le document référencé n'a pas été retrouvé (ne devrait
  // pas arriver en usage normal, mais évite un crash si jamais).
  clientInvoiceDocument: DocumentRow | null;
}) {
  const [description, setDescription] = useState(installment.invoice_description ?? "");
  const [amount, setAmount] = useState(String(installment.amount ?? 0));
  const [open, setOpen] = useState(installment.status === "draft");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function clearClientInvoice() {
    if (!confirm("Retirer la facture reçue du client sur ce versement ? Le fichier reste dans les documents du dossier, mais le client pourra en téléverser une nouvelle.")) return;
    startTransition(async () => {
      await clearInstallmentClientInvoiceAction(grantProjectId, installment.id);
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("invoice_description", description);
    fd.set("amount", amount);
    startTransition(async () => {
      const r = await updateBillingInstallmentAction(grantProjectId, installment.id, { error: null }, fd);
      if (r.error) setError(r.error);
      else setSaved(true);
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      await setBillingInstallmentStatusAction(grantProjectId, installment.id, installment.status === "submitted" ? "draft" : "submitted");
    });
  }

  function remove() {
    if (!confirm(`Supprimer le versement ${installment.installment_number} ?`)) return;
    startTransition(async () => {
      await deleteBillingInstallmentAction(grantProjectId, installment.id, installment.installment_number);
    });
  }

  const fullText = [`Versement de facturation n°${installment.installment_number} — période du ${installment.period_start} au ${installment.period_end}`, "", description, "", `Montant : ${money(Number(amount) || 0)}`].join("\n");

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <span className="text-sm font-semibold text-neutral-900">Versement {installment.installment_number}</span>
          <span className="ml-2 text-xs text-neutral-500">
            {installment.period_start} → {installment.period_end}
          </span>
          <span className="ml-2 text-xs font-medium text-neutral-700">{money(Number(amount) || 0)}</span>
        </div>
        <div className="flex items-center gap-2">
          {clientInvoiceDocument && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Facture reçue du client</span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${installment.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {installment.status === "submitted" ? "Facturé" : "Brouillon"}
          </span>
          <span className="text-xs text-neutral-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <CopyButton text={fullText} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleStatus} disabled={pending} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                {installment.status === "submitted" ? "Marquer comme brouillon" : "Marquer comme facturé"}
              </button>
              <button type="button" onClick={remove} disabled={pending} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                Supprimer
              </button>
            </div>
          </div>

          <section className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Facture du client</h3>
            {clientInvoiceDocument ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="text-neutral-900">
                    {clientInvoiceDocument.filename} <OpenDocumentButton storagePath={clientInvoiceDocument.storage_path} filename={clientInvoiceDocument.filename} />
                  </p>
                  <p className="text-xs text-neutral-500">
                    Reçue{installment.client_invoice_uploaded_at ? ` le ${formatDateTime(installment.client_invoice_uploaded_at)}` : ""} via le portail client.
                  </p>
                </div>
                <button type="button" onClick={clearClientInvoice} disabled={pending} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-white disabled:opacity-50">
                  Retirer
                </button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Le client n&apos;a pas encore indiqué que cette facture était faite ni téléversé de fichier depuis le portail.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900">Texte suggéré pour la facture</h3>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textarea} rows={5} />
          </section>

          <section className="max-w-xs space-y-1">
            <label className="text-xs font-medium text-neutral-600">Montant de ce versement</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </section>

          <div className="flex items-center gap-2 border-t border-neutral-100 pt-3">
            <button type="button" onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Enregistrement…" : "Enregistrer ce versement"}
            </button>
            {saved && !pending && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
