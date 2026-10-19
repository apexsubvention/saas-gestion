"use client";

// « Préparer ma facture » sous un versement du plan de facturation (0079, Jade) : la facture est
// déjà remplie dans le modèle du fournisseur à partir du plan (description, période, montant,
// taxes). Il inscrit son numéro, corrige au besoin les dates / l'échéance / le texte, puis la
// télécharge (Word) et/ou l'envoie comme facture faite du versement.
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  downloadGeneratedInvoiceAction,
  getInvoiceDraftAction,
  saveInvoiceDraftAction,
  sendGeneratedInvoiceAction,
  type InvoiceDraftInput,
} from "./invoiceTemplateActions";
import { useHasInvoiceTemplate, usePortalAccess } from "./PortalAccessContext";
import { downloadBase64 } from "./downloadBase64";
import { formatInvoiceMoney, invoiceTotals, type InvoiceDraftValues } from "@/features/invoices/invoiceTemplateFields";

const field = "w-full rounded-md border border-neutral-300 px-2 py-1 text-xs";
const labelCls = "block text-[11px] font-medium text-neutral-500";

function toInput(v: InvoiceDraftValues, amountText: string): InvoiceDraftInput {
  return {
    invoiceNumber: v.invoiceNumber,
    invoiceDate: v.invoiceDate,
    dueDate: v.dueDate,
    clientName: v.clientName,
    clientAddress: v.clientAddress,
    description: v.description,
    amount: Number(amountText.replace(/\s| |\$/g, "").replace(",", ".")),
    applyGst: v.applyGst,
    applyQst: v.applyQst,
    periodStart: v.periodStart,
    periodEnd: v.periodEnd,
  };
}

export function GeneratedInvoicePanel({ installmentId, alreadySent = false }: { installmentId: string; alreadySent?: boolean }) {
  const hasTemplate = useHasInvoiceTemplate();
  const { canEdit } = usePortalAccess();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<InvoiceDraftValues | null>(null);
  const [amountText, setAmountText] = useState("");
  const [sentDocumentId, setSentDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!hasTemplate || !canEdit) return null;

  function openPanel() {
    setOpen(true);
    if (values) return;
    start(async () => {
      const r = await getInvoiceDraftAction(installmentId);
      if (r.error || !r.values) return setError(r.error ?? "Facture introuvable.");
      setValues(r.values);
      setAmountText(String(r.values.amount).replace(".", ","));
      setSentDocumentId(r.sentDocumentId);
    });
  }

  const set = <K extends keyof InvoiceDraftValues>(k: K, v: InvoiceDraftValues[K]) => setValues((cur) => (cur ? { ...cur, [k]: v } : cur));
  const amount = Number(amountText.replace(/\s| |\$/g, "").replace(",", "."));
  const totals = values && Number.isFinite(amount) ? invoiceTotals({ amount, applyGst: values.applyGst, applyQst: values.applyQst }) : null;

  function act(kind: "save" | "download" | "send") {
    if (!values) return;
    setError(null);
    setMessage(null);
    if (kind === "send" && !values.invoiceNumber.trim()) return setError("Inscrivez votre numéro de facture avant de l'envoyer.");
    if (kind === "send" && (alreadySent || sentDocumentId) && !confirm("Une facture est déjà envoyée pour ce versement. La remplacer par celle-ci ?")) return;
    const input = toInput(values, amountText);
    start(async () => {
      if (kind === "save") {
        const r = await saveInvoiceDraftAction(installmentId, input);
        if (r.error) setError(r.error);
        else setMessage("Enregistré.");
      } else if (kind === "download") {
        const r = await downloadGeneratedInvoiceAction(installmentId, input);
        if (r.error || !r.base64) setError(r.error ?? "Téléchargement impossible.");
        else downloadBase64(r.base64, r.filename ?? "facture.docx");
      } else {
        const r = await sendGeneratedInvoiceAction(installmentId, input);
        if (r.error) setError(r.error);
        else {
          setMessage(r.message ?? "Facture envoyée.");
          setSentDocumentId("sent");
        }
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={openPanel} className="mt-1 text-xs font-medium text-indigo-700 hover:underline">
        {alreadySent ? "Refaire ma facture avec mon modèle" : "Préparer ma facture avec mon modèle"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-900">Facture préparée à partir du plan de facturation</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:underline">
          Fermer
        </button>
      </div>
      {!values ? (
        <p className="text-xs text-neutral-500">{pending ? "Préparation…" : error}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-0.5">
              <span className={labelCls}>N° de facture *</span>
              <input value={values.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="ex. 2403" className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>Date de la facture</span>
              <input type="date" value={values.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>Échéance</span>
              <input type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>Période du</span>
              <input type="date" value={values.periodStart ?? ""} onChange={(e) => set("periodStart", e.target.value || null)} className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>au</span>
              <input type="date" value={values.periodEnd ?? ""} onChange={(e) => set("periodEnd", e.target.value || null)} className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>Montant avant taxes</span>
              <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} className={field} />
            </label>
            <label className="space-y-0.5">
              <span className={labelCls}>Facturé à</span>
              <input value={values.clientName} onChange={(e) => set("clientName", e.target.value)} className={field} />
            </label>
            <label className="space-y-0.5 sm:col-span-2">
              <span className={labelCls}>Adresse du client (retenue pour les prochaines factures)</span>
              <input value={values.clientAddress} onChange={(e) => set("clientAddress", e.target.value)} className={field} />
            </label>
          </div>
          <label className="block space-y-0.5">
            <span className={labelCls}>Description des travaux</span>
            <textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={Math.min(10, Math.max(3, values.description.split("\n").length + 1))} className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={values.applyGst} onChange={(e) => set("applyGst", e.target.checked)} /> TPS 5 %
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={values.applyQst} onChange={(e) => set("applyQst", e.target.checked)} /> TVQ 9,975 %
            </label>
            {totals && (
              <span className="ml-auto">
                TPS {formatInvoiceMoney(totals.gst)} · TVQ {formatInvoiceMoney(totals.qst)} · <strong>Total {formatInvoiceMoney(totals.total)}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100 pt-2">
            <button type="button" disabled={pending} onClick={() => act("send")} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
              {pending ? "…" : "Envoyer comme facture du versement"}
            </button>
            <button type="button" disabled={pending} onClick={() => act("download")} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 disabled:opacity-50">
              Télécharger (Word)
            </button>
            <button type="button" disabled={pending} onClick={() => act("save")} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 disabled:opacity-50">
              Enregistrer sans envoyer
            </button>
            <Link href="/portal/modele-facture" className="ml-auto text-[11px] text-neutral-500 hover:underline">
              Mon modèle
            </Link>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {message && <p className="text-xs text-emerald-700">✓ {message}</p>}
        </>
      )}
    </div>
  );
}
