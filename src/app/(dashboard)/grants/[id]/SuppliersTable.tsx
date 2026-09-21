"use client";

import { useState, useTransition } from "react";
import { OpenDocumentButton } from "./OpenDocumentButton";
import {
  confirmInvoiceAction,
  deleteInvoiceAction,
  deleteSupplierAction,
  linkInvoiceClaimAction,
  moveSupplierAction,
  saveInvoiceAction,
  saveSupplierAction,
  type LedgerActionResult,
} from "./supplierActions";
import type { LedgerInvoice, LedgerSupplier } from "@/server/services/supplierLedger.service";

type DocOption = { id: string; filename: string; category: string };
type ClientOption = { id: string; name: string };
type ClaimOption = { id: string; label: string };

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const smallBtn = "rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

function money(n: number | null | undefined) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
}

// « 1 234,56 », « 1234.5 $ » -> nombre ; vide -> null ; invalide -> NaN
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

// Petit utilitaire : exécute une action serveur, expose l'état « en cours » et l'erreur.
function useLedgerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<LedgerActionResult>, onDone?: (r: LedgerActionResult) => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else onDone?.(r);
    });
  }
  return { pending, error, run };
}

function DocumentSelect({ value, onChange, documents }: { value: string; onChange: (v: string) => void; documents: DocOption[] }) {
  const sorted = [...documents].sort((a, b) => Number(b.category === "invoice") - Number(a.category === "invoice") || a.filename.localeCompare(b.filename));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">Aucun document</option>
      {sorted.map((d) => (
        <option key={d.id} value={d.id}>
          {d.category === "invoice" ? "🧾 " : ""}
          {d.filename}
        </option>
      ))}
    </select>
  );
}

function InvoiceRow({
  grantProjectId,
  invoice,
  supplierId,
  documents,
  claims,
  supplierChoices,
  onCancel,
}: {
  grantProjectId: string;
  invoice: LedgerInvoice | null;
  supplierId: string | null;
  documents: DocOption[];
  claims: ClaimOption[];
  supplierChoices?: Array<{ id: string; name: string }>; // factures sans fournisseur : on choisit lequel
  onCancel?: () => void;
}) {
  const [docId, setDocId] = useState(invoice?.document?.id ?? "");
  const [number, setNumber] = useState(invoice?.invoice_number ?? "");
  const [date, setDate] = useState(invoice?.invoice_date ?? "");
  const [amount, setAmount] = useState(invoice?.amount != null ? String(invoice.amount) : "");
  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [saved, setSaved] = useState(false);
  const [claimId, setClaimId] = useState(invoice?.claim?.claim_id ?? "");
  const [claimAmount, setClaimAmount] = useState(invoice?.claim?.claimed_amount != null ? String(invoice.claim.claimed_amount) : "");
  const { pending, error, run } = useLedgerAction();
  const claimDirty = !!invoice && (claimId !== (invoice.claim?.claim_id ?? "") || (claimId !== "" && claimAmount !== (invoice.claim?.claimed_amount != null ? String(invoice.claim.claimed_amount) : "")));

  function saveClaim() {
    const parsed = parseAmount(claimAmount);
    if (Number.isNaN(parsed)) return run(async () => ({ error: "Montant réclamé invalide." }));
    run(() => linkInvoiceClaimAction(grantProjectId, invoice!.id, claimId || null, claimId ? parsed : null));
  }

  const dirty =
    !invoice ||
    docId !== (invoice.document?.id ?? "") ||
    number !== (invoice.invoice_number ?? "") ||
    date !== (invoice.invoice_date ?? "") ||
    amount !== (invoice.amount != null ? String(invoice.amount) : "") ||
    supplier !== (supplierId ?? "");

  function save() {
    const parsed = parseAmount(amount);
    if (Number.isNaN(parsed)) return run(async () => ({ error: "Montant invalide." }));
    setSaved(false);
    run(
      () => saveInvoiceAction(grantProjectId, { id: invoice?.id ?? null, supplier_id: supplier || null, invoice_number: number || null, invoice_date: date || null, amount: parsed, document_id: docId || null }),
      () => { setSaved(true); onCancel?.(); }
    );
  }

  const needsReview = invoice?.source === "ai" && invoice.status === "to_review";

  return (
    <tr className={`border-b border-neutral-100 ${needsReview ? "bg-amber-50/50" : "bg-neutral-50/40"}`}>
      <td className="px-3 py-2 text-xs text-neutral-400">
        <span className="pl-3">↳ facture</span>
        {supplierChoices && (
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${input} mt-1`}>
            <option value="">Choisir le fournisseur…</option>
            {supplierChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </td>
      <td className="px-3 py-2">
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="N° de facture" className={input} />
      </td>
      <td className="px-3 py-2">
        <DocumentSelect value={docId} onChange={setDocId} documents={documents} />
        {invoice?.document && docId === invoice.document.id && (
          <div className="mt-1"><OpenDocumentButton storagePath={invoice.document.storage_path} filename={invoice.document.filename} /></div>
        )}
        {invoice && claims.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md bg-white p-2 ring-1 ring-neutral-200">
            <label className="block text-[11px] font-medium text-neutral-500">Réclamée dans
              <select value={claimId} onChange={(e) => { setClaimId(e.target.value); if (!e.target.value) setClaimAmount(""); else if (!claimAmount && invoice.amount != null) setClaimAmount(String(invoice.amount)); }} className={input}>
                <option value="">Pas encore réclamée</option>
                {claims.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            {claimId && (
              <label className="block text-[11px] font-medium text-neutral-500">Montant réclamé ($)
                <input inputMode="decimal" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} className={input} />
              </label>
            )}
            {claimDirty && <button onClick={saveClaim} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer le lien"}</button>}
          </div>
        )}
      </td>
      <td className="px-3 py-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></td>
      <td className="px-3 py-2"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Avant taxes" className={input} /></td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {dirty && <button onClick={save} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer"}</button>}
          {!dirty && saved && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
          {needsReview && (
            <button onClick={() => run(() => confirmInvoiceAction(grantProjectId, invoice!.id))} disabled={pending} className={smallBtn} title="Lue automatiquement : vérifie les valeurs puis confirme">
              Confirmer
            </button>
          )}
          {invoice ? (
            <button
              onClick={() => { if (confirm("Supprimer cette facture du tableau ? Le document téléversé est conservé.")) run(() => deleteInvoiceAction(grantProjectId, invoice.id)); }}
              disabled={pending}
              className={`${smallBtn} text-red-700`}
            >
              Supprimer
            </button>
          ) : (
            <button onClick={onCancel} className={smallBtn}>Annuler</button>
          )}
        </div>
        {needsReview && <p className="mt-1 text-xs text-amber-800">Lue automatiquement — à vérifier</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

function SupplierGroup({ grantProjectId, supplier, documents, clients, claims, isFirst, isLast }: { grantProjectId: string; supplier: LedgerSupplier; documents: DocOption[]; clients: ClientOption[]; claims: ClaimOption[]; isFirst: boolean; isLast: boolean }) {
  const [name, setName] = useState(supplier.name);
  const [budget, setBudget] = useState(supplier.budget_amount != null ? String(supplier.budget_amount) : "");
  const [contact, setContact] = useState(supplier.contact ?? "");
  const [frequency, setFrequency] = useState(supplier.billing_frequency ?? "");
  const [day, setDay] = useState(supplier.expected_invoice_day != null ? String(supplier.expected_invoice_day) : "");
  const [requirements, setRequirements] = useState(supplier.invoice_description_requirements ?? "");
  const [clientId, setClientId] = useState(supplier.supplier_client_id ?? "");
  const [showDetails, setShowDetails] = useState(false);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const { pending, error, run } = useLedgerAction();

  const dirty =
    name !== supplier.name ||
    budget !== (supplier.budget_amount != null ? String(supplier.budget_amount) : "") ||
    contact !== (supplier.contact ?? "") ||
    frequency !== (supplier.billing_frequency ?? "") ||
    day !== (supplier.expected_invoice_day != null ? String(supplier.expected_invoice_day) : "") ||
    requirements !== (supplier.invoice_description_requirements ?? "") ||
    clientId !== (supplier.supplier_client_id ?? "");

  const budgetNumber = supplier.budget_amount != null ? Number(supplier.budget_amount) : null;
  const left = budgetNumber != null ? budgetNumber - supplier.invoiced : null;

  function save() {
    const b = parseAmount(budget);
    const d = day.trim() ? Number(day) : null;
    if (Number.isNaN(b)) return run(async () => ({ error: "Budget invalide." }));
    if (d != null && !Number.isInteger(d)) return run(async () => ({ error: "Jour attendu invalide (1 à 31)." }));
    run(() =>
      saveSupplierAction(grantProjectId, {
        id: supplier.id,
        name,
        budget_amount: b,
        contact: contact || null,
        billing_frequency: frequency || null,
        expected_invoice_day: d,
        invoice_description_requirements: requirements || null,
        supplier_client_id: clientId || null,
      })
    );
  }

  return (
    <>
      <tr className="border-b border-neutral-100 bg-white">
        <td className="px-3 py-2"><input value={name} onChange={(e) => setName(e.target.value)} className={`${input} font-medium`} aria-label="Nom du fournisseur" /></td>
        <td className="px-3 py-2"><input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget $" className={input} aria-label="Budget" /></td>
        <td className="px-3 py-2 text-xs text-neutral-500">
          {supplier.invoices.length} facture{supplier.invoices.length > 1 ? "s" : ""}
          {left != null && <span className={left < 0 ? " text-red-700" : ""}> · reste {money(left)} au budget</span>}
        </td>
        <td className="px-3 py-2 text-xs text-neutral-400">—</td>
        <td className="px-3 py-2 text-sm font-semibold text-neutral-900">{money(supplier.invoiced)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {dirty && <button onClick={save} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer"}</button>}
            <button onClick={() => run(() => moveSupplierAction(grantProjectId, supplier.id, "up"))} disabled={pending || isFirst} className={smallBtn} title="Monter" aria-label="Monter">↑</button>
            <button onClick={() => run(() => moveSupplierAction(grantProjectId, supplier.id, "down"))} disabled={pending || isLast} className={smallBtn} title="Descendre" aria-label="Descendre">↓</button>
            <button onClick={() => setAddingInvoice(true)} className={smallBtn}>+ Facture</button>
            <button onClick={() => setShowDetails((v) => !v)} className={smallBtn}>{showDetails ? "Masquer" : "Détails"}</button>
            <button
              onClick={() => {
                const n = supplier.invoices.length;
                if (confirm(`Supprimer « ${supplier.name} » ?${n ? ` Ses ${n} facture(s) sont conservées, sans fournisseur.` : ""}`)) run(() => deleteSupplierAction(grantProjectId, supplier.id));
              }}
              disabled={pending}
              className={`${smallBtn} text-red-700`}
            >
              Supprimer
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
      </tr>
      {showDetails && (
        <tr className="border-b border-neutral-100 bg-neutral-50">
          <td colSpan={6} className="px-3 py-3">
            <p className="mb-2 text-xs text-neutral-500">
              Informations de facturation. Quand ce fournisseur est un client Apex (ex. Sitegrow), elles sont visibles dans son portail.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-neutral-600">Contact<input value={contact} onChange={(e) => setContact(e.target.value)} className={input} /></label>
              <label className="space-y-1 text-xs text-neutral-600">Fréquence de facturation<input value={frequency} onChange={(e) => setFrequency(e.target.value)} className={input} /></label>
              <label className="space-y-1 text-xs text-neutral-600">Jour attendu (1-31)<input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} className={input} /></label>
              <label className="space-y-1 text-xs text-neutral-600 sm:col-span-2">À inscrire sur la facture<input value={requirements} onChange={(e) => setRequirements(e.target.value)} className={input} /></label>
              <label className="space-y-1 text-xs text-neutral-600">Client Apex lié
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
                  <option value="">Aucun</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
          </td>
        </tr>
      )}
      {supplier.invoices.map((inv) => (
        <InvoiceRow key={`${inv.id}-${inv.status}`} grantProjectId={grantProjectId} invoice={inv} supplierId={supplier.id} documents={documents} claims={claims} />
      ))}
      {addingInvoice && <InvoiceRow grantProjectId={grantProjectId} invoice={null} supplierId={supplier.id} documents={documents} claims={claims} onCancel={() => setAddingInvoice(false)} />}
    </>
  );
}

function AddSupplierRow({ grantProjectId }: { grantProjectId: string }) {
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const { pending, error, run } = useLedgerAction();

  function add() {
    const b = parseAmount(budget);
    if (Number.isNaN(b)) return run(async () => ({ error: "Budget invalide." }));
    run(
      () => saveSupplierAction(grantProjectId, { id: null, name, budget_amount: b, contact: null, billing_frequency: null, expected_invoice_day: null, invoice_description_requirements: null, supplier_client_id: null }),
      () => { setName(""); setBudget(""); }
    );
  }

  return (
    <tr className="bg-neutral-50">
      <td className="px-3 py-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau fournisseur" className={input} /></td>
      <td className="px-3 py-2"><input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget $" className={input} /></td>
      <td colSpan={3} className="px-3 py-2 text-xs text-neutral-400">Ajoute un fournisseur, puis ses factures avec « + Facture ».</td>
      <td className="px-3 py-2">
        <button onClick={add} disabled={pending || !name.trim()} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "+ Ajouter"}</button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export function SuppliersTable({
  grantProjectId,
  suppliers,
  unassigned,
  documents,
  clients,
  claims,
  totals,
}: {
  grantProjectId: string;
  suppliers: LedgerSupplier[];
  unassigned: LedgerInvoice[];
  documents: DocOption[];
  clients: ClientOption[];
  claims: ClaimOption[];
  totals: { budget: number; spent: number };
}) {
  const choices = suppliers.map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Nom</th>
            <th className="px-3 py-2 font-medium">Budget</th>
            <th className="px-3 py-2 font-medium">Facture associée</th>
            <th className="px-3 py-2 font-medium">Date de la facture</th>
            <th className="px-3 py-2 font-medium">Montant (avant taxes)</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s, i) => (
            <SupplierGroup key={s.id} grantProjectId={grantProjectId} supplier={s} documents={documents} clients={clients} claims={claims} isFirst={i === 0} isLast={i === suppliers.length - 1} />
          ))}
          {unassigned.length > 0 && (
            <>
              <tr className="border-b border-neutral-100 bg-amber-50"><td colSpan={6} className="px-3 py-2 text-xs font-medium text-amber-900">Factures sans fournisseur — choisis le fournisseur de chacune.</td></tr>
              {unassigned.map((inv) => (
                <InvoiceRow key={`${inv.id}-${inv.status}`} grantProjectId={grantProjectId} invoice={inv} supplierId={null} documents={documents} claims={claims} supplierChoices={choices} />
              ))}
            </>
          )}
          <AddSupplierRow grantProjectId={grantProjectId} />
        </tbody>
        <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
          <tr>
            <td className="px-3 py-2 font-medium text-neutral-700">Total</td>
            <td className="px-3 py-2 font-medium text-neutral-900">{money(totals.budget)}</td>
            <td colSpan={2} />
            <td className="px-3 py-2 font-semibold text-neutral-900">{money(totals.spent)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
