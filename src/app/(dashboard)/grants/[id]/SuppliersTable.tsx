"use client";

// Tableau fournisseurs unique : identité + suivi financier (subvention acceptée / réclamé / solde) +
// factures, avec historique des modifications. Avant, ces informations étaient réparties sur deux
// tableaux empilés (un « auto », un « manuel ») -- fusionnés ici en un seul, où chaque valeur suivie
// reste modifiable à la main même quand elle est calculée automatiquement (mention AUTO / CALCULÉE /
// MODIFIÉE MANUELLEMENT, « revenir au calcul automatique » sans jamais perdre la valeur auto).
//
// Budget prévu (0060, Jade) : n'est plus une colonne du tableau. Juste sous chaque fournisseur,
// une ligne toujours visible (pas cachée derrière « Détails ») affiche ses postes de facturation --
// même composant/mêmes cases que dans Aide à la facturation, les deux listes sont connectées (même
// table billing_line_items). La somme des postes cochés « À facturer » liés à ce fournisseur EST
// Budget prévu (affiché dans le narratif juste au-dessus des postes) ; sans poste associé, un champ
// de saisie manuelle classique (TrackedCell) prend le relais. « Détails » ne contient plus que les
// informations de facturation (contact/fréquence/jour/exigences/lien client) et l'historique -- les
// factures (ajout, statut, preuve de paiement) restent, elles, gérées directement dans le tableau
// principal comme avant, sans changement.
//
// Taux d'aide par poste (0061, Jade -- dossier Caracol/Sitegrow) : certaines conventions ont un
// taux différent selon le type de frais (ex. formation à 85 % alors que le taux global du dossier,
// tous frais confondus, en est un autre) -- chaque poste peut donc porter son propre taux d'aide,
// optionnel ; sans lui, il utilise le taux du dossier. « Subvention acceptée » (AUTO) est alors
// calculée poste par poste avec le bon taux plutôt qu'en appliquant le taux global à tout le
// Budget prévu -- voir supplierLedger.service.ts.
import { Fragment, useState, useTransition } from "react";
import { OpenDocumentButton } from "./OpenDocumentButton";
import {
  confirmInvoiceAction,
  deleteInvoiceAction,
  deleteSupplierAction,
  getSupplierHistoryAction,
  linkInvoiceClaimAction,
  moveSupplierAction,
  saveInvoiceAction,
  saveSupplierAction,
  setInvoicePaymentProofAction,
  setSupplierOverrideAction,
  updateBillingLineItemAction,
  updateInvoicePaymentStatusAction,
  type LedgerActionResult,
} from "./supplierActions";
import type { LedgerInvoice, LedgerSupplier, Tracked } from "@/server/services/supplierLedger.service";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
import type { DossierEventRow } from "@/server/services/audit";
import { buildBillingNarrative, type BillingNarrativeInput } from "@/features/billing/billingSummary";

// Jade (0058) : pourquoi un poste est décoché -- même libellés que LineItemsEditor.tsx (Aide à la
// facturation), pour que ce soit reconnaissable, que l'un ou l'autre écran serve à cocher.
const EXCLUSION_REASON_LABELS: Record<string, string> = {
  internal_salary: "Salaire interne (non facturé)",
  redistribute_supplier: "À redistribuer à un autre fournisseur",
  new_supplier: "Nécessite l'ajout d'un nouveau fournisseur",
};

// Postes budgétaires (Aide à la facturation) associés à CE fournisseur (0060, Jade) : affichés
// juste sous chaque fournisseur (toujours visibles, plus besoin d'ouvrir « Détails »), modifiables
// directement ici -- même mécanisme, sans changer d'onglet. Budget prévu = somme de ceux cochés
// « À facturer » ci-dessous.
function SupplierLineItemRow({ grantProjectId, item, projectRate }: { grantProjectId: string; item: BillingLineItemRow; projectRate: number | null }) {
  const [label, setLabel] = useState(item.label);
  const [description, setDescription] = useState(item.description ?? "");
  const [amount, setAmount] = useState(String(item.amount ?? 0));
  const [hours, setHours] = useState(item.hours != null ? String(item.hours) : "");
  const [included, setIncluded] = useState(item.included_in_billing);
  const [exclusionReason, setExclusionReason] = useState(item.exclusion_reason ?? "");
  const [subsidyRatePercent, setSubsidyRatePercent] = useState(item.subsidy_rate != null ? String(Math.round(item.subsidy_rate * 10000) / 100) : "");
  const { pending, error, run } = useLedgerAction();
  const [saved, setSaved] = useState(false);

  const dirty =
    label !== item.label ||
    description !== (item.description ?? "") ||
    amount !== String(item.amount ?? 0) ||
    hours !== (item.hours != null ? String(item.hours) : "") ||
    included !== item.included_in_billing ||
    exclusionReason !== (item.exclusion_reason ?? "") ||
    subsidyRatePercent !== (item.subsidy_rate != null ? String(Math.round(item.subsidy_rate * 10000) / 100) : "");

  // Aperçu : montant subventionné de CE poste, avec son propre taux s'il en a un, sinon le taux du
  // dossier -- affiché même décoché (0061, Jade : « il faudrait quand même le mettre de l'avant, que
  // ça c'est couvert », pour un coût interne comme un salaire jamais facturé mais bien subventionné).
  const previewRatePercent = subsidyRatePercent.trim() ? Number(subsidyRatePercent) : projectRate != null ? Math.round(projectRate * 10000) / 100 : null;
  const previewAmount = parseAmount(amount);
  const subsidyPreview = previewRatePercent != null && previewAmount != null && !Number.isNaN(previewAmount) ? Math.round(previewAmount * (previewRatePercent / 100) * 100) / 100 : null;

  function save() {
    const amt = parseAmount(amount);
    if (amt == null || Number.isNaN(amt)) return run(async () => ({ error: "Montant invalide." }));
    const hrs = hours.trim() ? Number(hours) : null;
    if (hrs != null && !Number.isFinite(hrs)) return run(async () => ({ error: "Heures invalides." }));
    const ratePercent = subsidyRatePercent.trim() ? Number(subsidyRatePercent) : null;
    if (ratePercent != null && (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100)) return run(async () => ({ error: "Taux d'aide invalide (0 à 100)." }));
    setSaved(false);
    run(
      () =>
        updateBillingLineItemAction(grantProjectId, item.id, {
          label,
          description: description || null,
          amount: amt,
          hours: hrs,
          included_in_billing: included,
          exclusion_reason: included ? null : (exclusionReason as "internal_salary" | "redistribute_supplier" | "new_supplier" | "") || null,
          supplier_id: item.supplier_id,
          subsidy_rate: ratePercent != null ? Math.round((ratePercent / 100) * 10000) / 10000 : null,
        }),
      () => setSaved(true)
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12 sm:items-start ${included ? "border-neutral-200 bg-white" : "border-neutral-200 bg-neutral-50 opacity-70"}`}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${input} sm:col-span-4`} placeholder="Activité / poste" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${input} sm:col-span-3`} rows={1} placeholder="Détail" />
      <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} sm:col-span-1`} placeholder="Montant $" />
      <input type="number" min={0} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className={`${input} sm:col-span-1`} placeholder="Heures" />
      <label className="flex items-center gap-1 text-xs text-neutral-600 sm:col-span-1">
        <input type="checkbox" checked={included} onChange={(e) => setIncluded(e.target.checked)} /> À facturer
      </label>
      {!included && (
        <select value={exclusionReason} onChange={(e) => setExclusionReason(e.target.value)} className={`${input} sm:col-span-2`}>
          <option value="">Pourquoi (optionnel)…</option>
          {Object.entries(EXCLUSION_REASON_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      )}
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={subsidyRatePercent}
        onChange={(e) => setSubsidyRatePercent(e.target.value)}
        className={`${input} sm:col-span-2`}
        placeholder={`Taux d'aide %${projectRate != null ? ` (dossier : ${Math.round(projectRate * 10000) / 100}%)` : ""}`}
        title="Optionnel -- remplace le taux d'aide du dossier pour ce poste précis. Vide = utilise le taux du dossier."
      />
      <div className={`flex items-center gap-1 ${included ? "sm:col-span-2" : ""}`}>
        {dirty && (
          <button onClick={save} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>
            {pending ? "…" : "Enregistrer"}
          </button>
        )}
        {!dirty && saved && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
      </div>
      {subsidyPreview != null && (
        <p className="text-[11px] text-neutral-400 sm:col-span-12">
          {included ? "Subventionné" : "Couvert par la subvention (non facturé)"} : <span className="font-medium text-neutral-600">{money(subsidyPreview)}</span>
          {previewRatePercent != null ? ` (${previewRatePercent}%${subsidyRatePercent.trim() ? "" : ", taux du dossier"})` : ""}
        </p>
      )}
      {error && <p className="text-xs text-red-600 sm:col-span-12">{error}</p>}
    </div>
  );
}

// Jade : le tableau Fournisseurs n'a plus de colonne « Budget prévu » séparée -- ce sont ces
// postes, toujours visibles ici (plus besoin d'ouvrir « Détails »), qui EN TIENNENT LIEU,
// exactement comme dans Aide à la facturation (même mécanisme, mêmes cases). Repli manuel
// conservé (comportement historique) tant qu'aucun poste n'est encore associé à ce fournisseur.
function SupplierLineItems({
  grantProjectId,
  supplierId,
  items,
  budget,
  projectRate,
}: {
  grantProjectId: string;
  supplierId: string;
  items: BillingLineItemRow[];
  budget: Tracked;
  // Taux d'aide du dossier -- utilisé comme repli quand un poste n'a pas son propre taux (0061).
  projectRate: number | null;
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-400">
          Aucun poste associé à ce fournisseur pour l&apos;instant -- associe-le à ce fournisseur dans{" "}
          <span className="font-medium">Aide à la facturation</span>, il apparaîtra ensuite ici et deviendra Budget prévu. En
          attendant, tu peux saisir un budget prévu à la main :
        </p>
        <TrackedCell grantProjectId={grantProjectId} supplierId={supplierId} field="budget" tracked={budget} />
      </div>
    );
  }
  const includedTotal = items.filter((it) => it.included_in_billing).reduce((sum, it) => sum + Number(it.amount ?? 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">
        Postes associés à ce fournisseur ({items.length}) — Budget prévu = somme de ceux cochés « À facturer » ci-dessous :{" "}
        <span className="font-medium text-neutral-700">{money(includedTotal)}</span>. Subvention acceptée = somme de chaque poste x son
        propre taux d&apos;aide (ou le taux du dossier si aucun n&apos;est précisé).
      </p>
      <div className="space-y-2">
        {items.map((it) => (
          <SupplierLineItemRow key={it.id} grantProjectId={grantProjectId} item={it} projectRate={projectRate} />
        ))}
      </div>
    </div>
  );
}

// Contexte du dossier (mêmes chiffres que SubsidyPanel) nécessaire pour rédiger, par fournisseur,
// le résumé « devra facturer X $ d'ici le ... » -- voir billingContext plus bas.
export type SupplierBillingContext = Pick<BillingNarrativeInput, "clientName" | "subsidy" | "deadline">;

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
  const cleaned = text.replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
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

const MODE_BADGE: Record<Tracked["mode"], { label: string; className: string } | null> = {
  auto: { label: "AUTO", className: "bg-emerald-50 text-emerald-700" },
  calculated: { label: "CALCULÉE", className: "bg-slate-100 text-slate-600" },
  manual: { label: "MODIFIÉE MANUELLEMENT", className: "bg-amber-100 text-amber-800" },
  none: null,
};

// Une valeur suivie : effective + mention AUTO / CALCULÉE / MODIFIÉE MANUELLEMENT, modification à la
// main et « Revenir au calcul automatique » (la valeur automatique n'est jamais détruite).
function TrackedCell({ grantProjectId, supplierId, field, tracked }: { grantProjectId: string; supplierId: string; field: "accepted" | "claimed" | "budget"; tracked: Tracked }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tracked.effective != null ? String(tracked.effective) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = MODE_BADGE[tracked.mode];
  // Jade : « Budget prévu » calculé (postes cochés « À facturer » associés à ce fournisseur) doit
  // toujours refléter exactement ces postes -- pas de saisie manuelle qui viendrait le masquer.
  // Non éditable ici tant que ce calcul existe ; pour le changer, il faut changer les postes.
  const lockedToAuto = field === "budget" && tracked.mode === "auto";

  function run(value: number | null) {
    setError(null);
    startTransition(async () => {
      const r = await setSupplierOverrideAction(grantProjectId, supplierId, field, value);
      if (r.error) setError(r.error);
      else setEditing(false);
    });
  }

  function save() {
    const v = parseAmount(text);
    if (v == null || Number.isNaN(v)) return setError("Montant invalide.");
    run(v);
  }

  if (lockedToAuto) {
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium text-neutral-900">{money(tracked.effective)}</span>
        <div className="flex flex-wrap items-center gap-1">
          {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
        </div>
        <p className="text-[11px] text-neutral-400">Calculé à partir des postes cochés « À facturer » — ouvre « Détails » ci-dessous pour les modifier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {editing ? (
        <div className="flex items-center gap-1">
          <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-sm" autoFocus />
          <button onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{pending ? "…" : "OK"}</button>
          <button onClick={() => setEditing(false)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">Annuler</button>
        </div>
      ) : (
        <button onClick={() => { setText(tracked.effective != null ? String(tracked.effective) : ""); setEditing(true); }} className="text-left text-sm font-medium text-neutral-900 hover:underline" title="Modifier à la main">
          {money(tracked.effective)}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
        {tracked.mode === "manual" && (
          <button onClick={() => run(null)} disabled={pending} className="text-[11px] text-blue-600 underline disabled:opacity-50" title={tracked.auto != null ? `Valeur automatique : ${money(tracked.auto)}` : undefined}>
            Revenir au calcul automatique{tracked.auto != null ? ` (${money(tracked.auto)})` : ""}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = { manual: "Saisie manuelle", ai: "Lue par IA", convention: "Convention", import: "Import" };
const CONFIDENCE_LABELS: Record<string, string> = { high: "confiance élevée", medium: "confiance moyenne", low: "confiance faible" };
const EVENT_SOURCE_LABELS: Record<DossierEventRow["source"], { label: string; className: string }> = {
  manual: { label: "Manuel", className: "bg-slate-100 text-slate-600" },
  system: { label: "Apex", className: "bg-indigo-50 text-indigo-700" },
  ai: { label: "IA", className: "bg-violet-50 text-violet-700" },
  portal: { label: "Client", className: "bg-emerald-50 text-emerald-700" },
};

function SupplierHistory({ grantProjectId, supplierId }: { grantProjectId: string; supplierId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<DossierEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!loaded && !pending) {
    startTransition(async () => {
      const r = await getSupplierHistoryAction(grantProjectId, supplierId);
      if (r.error) setError(r.error);
      else setEvents(r.events ?? []);
      setLoaded(true);
    });
  }

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3">
      <h4 className="text-xs font-semibold text-neutral-700">🕐 Historique des modifications</h4>
      {pending && <p className="text-xs text-neutral-400">Chargement…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!pending && !error && events.length === 0 && <p className="text-xs text-neutral-400">Aucune modification enregistrée pour l&apos;instant.</p>}
      {events.length > 0 && (
        <ol className="space-y-1.5">
          {events.map((e) => {
            const src = EVENT_SOURCE_LABELS[e.source] ?? EVENT_SOURCE_LABELS.system;
            return (
              <li key={e.id} className="flex gap-3 text-xs">
                <time className="w-24 shrink-0 text-neutral-400" dateTime={e.occurred_at}>
                  {new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(e.occurred_at))}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="text-neutral-800">
                    {e.title} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${src.className}`}>{src.label}</span>
                  </p>
                  {e.detail && <p className="text-neutral-500">{e.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Jade (0057) : statut de paiement d'une facture -- « Envoyée, non payée » par défaut, « Payée »
// une fois le client (ou le personnel) confirme -- et sa preuve de paiement (document choisi
// parmi ceux déjà déposés sur ce dossier, même widget que le document de la facture).
const PAYMENT_STATUS_LABELS: Record<string, string> = { sent_unpaid: "Envoyée, non payée", paid: "Payée" };

function InvoicePaymentRow({ grantProjectId, invoice, documents }: { grantProjectId: string; invoice: LedgerInvoice; documents: DocOption[] }) {
  const [proofDocId, setProofDocId] = useState(invoice.paymentProof?.id ?? "");
  const { pending: statusPending, error: statusError, run: runStatus } = useLedgerAction();
  const { pending: proofPending, error: proofError, run: runProof } = useLedgerAction();

  function changeStatus(status: string) {
    runStatus(() => updateInvoicePaymentStatusAction(grantProjectId, invoice.id, status));
  }

  function saveProof(id: string) {
    setProofDocId(id);
    runProof(() => setInvoicePaymentProofAction(grantProjectId, invoice.id, id || null));
  }

  return (
    <tr className="border-b border-neutral-100 bg-white">
      <td className="px-3 py-2 text-xs text-neutral-400"><span className="pl-3">↳ paiement</span></td>
      <td className="px-3 py-2" colSpan={5}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            Statut
            <select value={invoice.paymentStatus} onChange={(e) => changeStatus(e.target.value)} disabled={statusPending} className={input}>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {invoice.paymentStatus === "paid" && (
            <label className="flex flex-1 items-center gap-2 text-xs text-neutral-600">
              Preuve de paiement
              <DocumentSelect value={proofDocId} onChange={saveProof} documents={documents} />
            </label>
          )}
          {invoice.paymentProof && proofDocId === invoice.paymentProof.id && (
            <OpenDocumentButton storagePath={invoice.paymentProof.storage_path} filename={invoice.paymentProof.filename} />
          )}
          {(statusPending || proofPending) && <span className="text-xs text-neutral-400">…</span>}
        </div>
        {(statusError || proofError) && <p className="mt-1 text-xs text-red-600">{statusError ?? proofError}</p>}
      </td>
    </tr>
  );
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
  isEmployee,
  onCancel,
}: {
  grantProjectId: string;
  invoice: LedgerInvoice | null;
  supplierId: string | null;
  documents: DocOption[];
  claims: ClaimOption[];
  supplierChoices?: Array<{ id: string; name: string }>; // factures sans fournisseur : on choisit lequel
  // Jade (0065, PARI CNRC/IRAP) : salarié interne -- vocabulaire "N° DDR"/"Heures"/"Taux horaire"
  // plutôt que "N° de facture", champs heures/taux en plus (optionnels, servent à préremplir le
  // montant mais celui-ci reste modifiable directement, comme partout ailleurs dans ce tableau).
  isEmployee?: boolean;
  onCancel?: () => void;
}) {
  const [docId, setDocId] = useState(invoice?.document?.id ?? "");
  const [number, setNumber] = useState(invoice?.invoice_number ?? "");
  const [date, setDate] = useState(invoice?.invoice_date ?? "");
  const [amount, setAmount] = useState(invoice?.amount != null ? String(invoice.amount) : "");
  const [hours, setHours] = useState(invoice?.hours != null ? String(invoice.hours) : "");
  const [hourlyRate, setHourlyRate] = useState(invoice?.hourlyRate != null ? String(invoice.hourlyRate) : "");
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

  // Préremplit le montant à partir de heures x taux horaire quand les deux sont saisis et que le
  // montant n'a pas déjà été touché à la main -- jamais imposé, l'utilisateur garde la main sur le
  // champ Montant (même logique que les postes de facturation, SupplierLineItemRow).
  function onHoursOrRateChange(nextHours: string, nextRate: string) {
    setHours(nextHours);
    setHourlyRate(nextRate);
    const h = Number(nextHours);
    const r = Number(nextRate);
    if (nextHours.trim() && nextRate.trim() && Number.isFinite(h) && Number.isFinite(r) && !amount.trim()) {
      setAmount(String(Math.round(h * r * 100) / 100));
    }
  }

  const dirty =
    !invoice ||
    docId !== (invoice.document?.id ?? "") ||
    number !== (invoice.invoice_number ?? "") ||
    date !== (invoice.invoice_date ?? "") ||
    amount !== (invoice.amount != null ? String(invoice.amount) : "") ||
    hours !== (invoice.hours != null ? String(invoice.hours) : "") ||
    hourlyRate !== (invoice.hourlyRate != null ? String(invoice.hourlyRate) : "") ||
    supplier !== (supplierId ?? "");

  function save() {
    const parsed = parseAmount(amount);
    if (Number.isNaN(parsed)) return run(async () => ({ error: "Montant invalide." }));
    const h = hours.trim() ? Number(hours) : null;
    if (h != null && !Number.isFinite(h)) return run(async () => ({ error: "Heures invalides." }));
    const r = hourlyRate.trim() ? Number(hourlyRate) : null;
    if (r != null && !Number.isFinite(r)) return run(async () => ({ error: "Taux horaire invalide." }));
    setSaved(false);
    run(
      () => saveInvoiceAction(grantProjectId, { id: invoice?.id ?? null, supplier_id: supplier || null, invoice_number: number || null, invoice_date: date || null, amount: parsed, document_id: docId || null, hours: h, hourly_rate: r }),
      () => { setSaved(true); onCancel?.(); }
    );
  }

  const needsReview = invoice?.source === "ai" && invoice.status === "to_review";

  return (
    <tr className={`border-b border-neutral-100 ${needsReview ? "bg-amber-50/50" : "bg-neutral-50/40"}`}>
      <td className="px-3 py-2 text-xs text-neutral-400">
        <span className="pl-3">↳ {isEmployee ? "DDR" : "facture"}</span>
        {supplierChoices && (
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${input} mt-1`}>
            <option value="">Choisir le fournisseur…</option>
            {supplierChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </td>
      <td className="px-3 py-2">
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={isEmployee ? "N° DDR (ex. DDR1)" : "N° de facture"} className={input} />
        {isEmployee && (
          <div className="mt-1 flex gap-1">
            <input inputMode="decimal" value={hours} onChange={(e) => onHoursOrRateChange(e.target.value, hourlyRate)} placeholder="Heures" className={`${input} w-1/2`} />
            <input inputMode="decimal" value={hourlyRate} onChange={(e) => onHoursOrRateChange(hours, e.target.value)} placeholder="Taux horaire $" className={`${input} w-1/2`} />
          </div>
        )}
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
      <td className="px-3 py-2"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isEmployee ? "Montant accepté par le PARI" : "Avant taxes"} className={input} /></td>
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
              onClick={() => { if (confirm(`Supprimer ce${isEmployee ? " DDR" : "tte facture"} du tableau ? Le document téléversé est conservé.`)) run(() => deleteInvoiceAction(grantProjectId, invoice.id)); }}
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

function SupplierGroup({ grantProjectId, supplier, documents, clients, claims, lineItems, isFirst, isLast, billingContext }: { grantProjectId: string; supplier: LedgerSupplier; documents: DocOption[]; clients: ClientOption[]; claims: ClaimOption[]; lineItems: BillingLineItemRow[]; isFirst: boolean; isLast: boolean; billingContext?: SupplierBillingContext }) {
  // Taux d'aide du dossier (0061) : repli pour les postes qui n'ont pas leur propre taux -- même
  // valeur que celle utilisée par le narratif ci-dessus (subsidy.rate, computeSubsidy()).
  const projectRate = billingContext?.subsidy.rate ?? null;
  const isEmployee = supplier.is_employee;
  const [name, setName] = useState(supplier.name);
  const [contact, setContact] = useState(supplier.contact ?? "");
  const [role, setRole] = useState(supplier.role ?? "");
  const [frequency, setFrequency] = useState(supplier.billing_frequency ?? "");
  const [day, setDay] = useState(supplier.expected_invoice_day != null ? String(supplier.expected_invoice_day) : "");
  const [requirements, setRequirements] = useState(supplier.invoice_description_requirements ?? "");
  const [clientId, setClientId] = useState(supplier.supplier_client_id ?? "");
  const [showDetails, setShowDetails] = useState(false);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const { pending, error, run } = useLedgerAction();

  const dirty =
    name !== supplier.name ||
    contact !== (supplier.contact ?? "") ||
    role !== (supplier.role ?? "") ||
    frequency !== (supplier.billing_frequency ?? "") ||
    day !== (supplier.expected_invoice_day != null ? String(supplier.expected_invoice_day) : "") ||
    requirements !== (supplier.invoice_description_requirements ?? "") ||
    clientId !== (supplier.supplier_client_id ?? "");

  // Résumé en langage clair (Jade) : reprend le contexte du dossier (dépense totale requise,
  // portion subventionnée -- mêmes chiffres que SubsidyPanel) et le budget prévu DE CE fournisseur
  // comme montant à facturer -- jamais le total du projet, pour ne pas laisser croire qu'un
  // fournisseur parmi d'autres doit à lui seul facturer tout le dossier. Budget prévu (0059) peut
  // désormais venir des postes budgétaires cochés/associés dans Aide à la facturation -- même
  // valeur "effective" que celle affichée dans la colonne Budget prévu ci-dessous.
  const narrative = billingContext
    ? buildBillingNarrative({
        clientName: billingContext.clientName,
        subsidy: billingContext.subsidy,
        billerLabel: supplier.name,
        billerAmount: supplier.budget.effective,
        deadline: billingContext.deadline,
      })
    : null;

  // Jade (0059) : Budget prévu n'est plus enregistré avec les autres champs de la fiche -- il a son
  // propre bouton (comme Subvention acceptée / Réclamé), pour pouvoir revenir au calcul automatique
  // (somme des postes associés) sans y toucher ici. budget_amount de la ligne n'est donc jamais
  // modifié par ce formulaire : on renvoie sa valeur actuelle telle quelle.
  function save() {
    const d = day.trim() ? Number(day) : null;
    if (d != null && !Number.isInteger(d)) return run(async () => ({ error: "Jour attendu invalide (1 à 31)." }));
    run(() =>
      saveSupplierAction(grantProjectId, {
        id: supplier.id,
        name,
        budget_amount: supplier.budget_amount,
        contact: contact || null,
        billing_frequency: frequency || null,
        expected_invoice_day: d,
        invoice_description_requirements: requirements || null,
        supplier_client_id: clientId || null,
        is_employee: isEmployee,
        role: role || null,
      })
    );
  }

  return (
    <>
      <tr className="border-b border-neutral-100 bg-white align-top">
        <td className="px-3 py-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} font-medium`} aria-label={isEmployee ? "Nom du salarié" : "Nom du fournisseur"} />
          {isEmployee && <span className="mt-1 inline-block rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">SALARIÉ INTERNE</span>}
        </td>
        <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} supplierId={supplier.id} field="accepted" tracked={supplier.accepted} /></td>
        <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} supplierId={supplier.id} field="claimed" tracked={supplier.claimed} /></td>
        <td className={`px-3 py-2 text-sm font-semibold ${supplier.remaining != null && supplier.remaining < 0 ? "text-red-700" : "text-neutral-900"}`}>{money(supplier.remaining)}</td>
        <td className="px-3 py-2 text-xs text-neutral-500">
          {supplier.invoices.length} {isEmployee ? "DDR" : `facture${supplier.invoices.length > 1 ? "s" : ""}`}
          <div>{money(supplier.invoiced)} {isEmployee ? "réclamé" : "facturé"}</div>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {dirty && <button onClick={save} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer"}</button>}
            <button onClick={() => run(() => moveSupplierAction(grantProjectId, supplier.id, "up"))} disabled={pending || isFirst} className={smallBtn} title="Monter" aria-label="Monter">↑</button>
            <button onClick={() => run(() => moveSupplierAction(grantProjectId, supplier.id, "down"))} disabled={pending || isLast} className={smallBtn} title="Descendre" aria-label="Descendre">↓</button>
            <button onClick={() => setAddingInvoice(true)} className={smallBtn}>{isEmployee ? "+ DDR" : "+ Facture"}</button>
            <button onClick={() => setShowDetails((v) => !v)} className={smallBtn}>{showDetails ? "Masquer" : "Détails"}</button>
            <button
              onClick={() => {
                const n = supplier.invoices.length;
                if (confirm(`Supprimer « ${supplier.name} » ?${n ? ` Ses ${n} ${isEmployee ? "DDR sont conservés" : "facture(s) sont conservées"}, sans fournisseur.` : ""}`)) run(() => deleteSupplierAction(grantProjectId, supplier.id));
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
      <tr className="border-b border-neutral-100 bg-white">
        <td colSpan={6} className="px-3 pb-3">
          {narrative && <p className="mb-2 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{narrative}</p>}
          <h4 className="mb-2 text-xs font-semibold text-neutral-700">Budget prévu — postes de facturation</h4>
          <SupplierLineItems grantProjectId={grantProjectId} supplierId={supplier.id} items={lineItems} budget={supplier.budget} projectRate={projectRate} />
        </td>
      </tr>
      {showDetails && (
        <tr className="border-b border-neutral-100 bg-neutral-50">
          <td colSpan={6} className="px-3 py-3">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <input type="checkbox" checked={isEmployee} onChange={(e) => run(() => saveSupplierAction(grantProjectId, { id: supplier.id, name, budget_amount: supplier.budget_amount, contact: contact || null, billing_frequency: frequency || null, expected_invoice_day: day.trim() ? Number(day) : null, invoice_description_requirements: requirements || null, supplier_client_id: clientId || null, is_employee: e.target.checked, role: role || null }))} />
              Salarié interne (plutôt que fournisseur externe)
            </label>
            {isEmployee ? (
              <>
                <p className="mb-2 text-xs text-neutral-500">Coûts internes (heures x taux horaire) -- suivis par DDR ci-dessus.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-xs text-neutral-600">Rôle<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex. Ingénieur logiciel" className={input} /></label>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
            <div className="mt-3">
              <SupplierHistory grantProjectId={grantProjectId} supplierId={supplier.id} />
            </div>
          </td>
        </tr>
      )}
      {supplier.invoices.map((inv) => (
        <Fragment key={inv.id}>
          <InvoiceRow key={`${inv.id}-${inv.status}`} grantProjectId={grantProjectId} invoice={inv} supplierId={supplier.id} documents={documents} claims={claims} isEmployee={isEmployee} />
          <InvoicePaymentRow key={`${inv.id}-payment`} grantProjectId={grantProjectId} invoice={inv} documents={documents} />
        </Fragment>
      ))}
      {addingInvoice && <InvoiceRow grantProjectId={grantProjectId} invoice={null} supplierId={supplier.id} documents={documents} claims={claims} isEmployee={isEmployee} onCancel={() => setAddingInvoice(false)} />}
    </>
  );
}

function AddSupplierRow({ grantProjectId }: { grantProjectId: string }) {
  const [name, setName] = useState("");
  const { pending, error, run } = useLedgerAction();

  function add() {
    run(
      () => saveSupplierAction(grantProjectId, { id: null, name, budget_amount: null, contact: null, billing_frequency: null, expected_invoice_day: null, invoice_description_requirements: null, supplier_client_id: null }),
      () => setName("")
    );
  }

  return (
    <tr className="bg-neutral-50">
      <td className="px-3 py-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau fournisseur" className={input} /></td>
      <td colSpan={4} className="px-3 py-2 text-xs text-neutral-400">
        Ajoute un fournisseur, puis associe-lui des postes dans Aide à la facturation (Budget prévu) et ses factures avec « + Facture ». Le
        suivi financier (subvention acceptée, réclamé) s&apos;ajuste ensuite dans son tableau.
      </td>
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
  lineItems,
  totals,
  billingContext,
}: {
  grantProjectId: string;
  suppliers: LedgerSupplier[];
  unassigned: LedgerInvoice[];
  documents: DocOption[];
  clients: ClientOption[];
  claims: ClaimOption[];
  // Postes budgétaires (Aide à la facturation) de TOUT le dossier -- filtrés par fournisseur pour
  // le « Détails » de chacun, voir SupplierLineItems.
  lineItems: BillingLineItemRow[];
  totals: { budget: number; accepted: number; claimed: number; remaining: number };
  billingContext?: SupplierBillingContext;
}) {
  const choices = suppliers.map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Subvention acceptée</th>
              <th className="px-3 py-2 font-medium">Réclamé à ce jour</th>
              <th className="px-3 py-2 font-medium">Solde restant</th>
              <th className="px-3 py-2 font-medium">Factures</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, i) => (
              <SupplierGroup
                key={s.id}
                grantProjectId={grantProjectId}
                supplier={s}
                documents={documents}
                clients={clients}
                claims={claims}
                lineItems={lineItems.filter((it) => it.supplier_id === s.id)}
                isFirst={i === 0}
                isLast={i === suppliers.length - 1}
                billingContext={billingContext}
              />
            ))}
            {unassigned.length > 0 && (
              <>
                <tr className="border-b border-neutral-100 bg-amber-50"><td colSpan={6} className="px-3 py-2 text-xs font-medium text-amber-900">Factures sans fournisseur — choisis le fournisseur de chacune.</td></tr>
                {unassigned.map((inv) => (
                  <Fragment key={inv.id}>
                    <InvoiceRow key={`${inv.id}-${inv.status}`} grantProjectId={grantProjectId} invoice={inv} supplierId={null} documents={documents} claims={claims} supplierChoices={choices} />
                    <InvoicePaymentRow key={`${inv.id}-payment`} grantProjectId={grantProjectId} invoice={inv} documents={documents} />
                  </Fragment>
                ))}
              </>
            )}
            <AddSupplierRow grantProjectId={grantProjectId} />
          </tbody>
          <tfoot className="border-t border-neutral-300 bg-neutral-50 text-sm font-semibold text-neutral-900">
            <tr>
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2">{money(totals.accepted)}</td>
              <td className="px-3 py-2">{money(totals.claimed)}</td>
              <td className="px-3 py-2">{money(totals.remaining)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-neutral-400">
        Budget prévu n&apos;est plus une colonne à part : les postes de chaque fournisseur (mêmes cases et montants que dans Aide à la
        facturation) sont affichés directement sous son nom, toujours visibles — leur somme cochée « À facturer » EST Budget prévu. Sans poste
        associé, il reste saisissable à la main comme avant. « Subvention acceptée » et « Réclamé à ce jour » se calculent automatiquement
        (AUTO/CALCULÉE) mais restent modifiables à la main (clique sur le montant, puis « Revenir au calcul automatique » pour annuler — la
        valeur automatique n&apos;est jamais perdue) ; « Réclamé » vient des réclamations liées aux factures du fournisseur. Ouvre « Détails »
        sur un fournisseur pour ses informations de facturation et l&apos;historique complet de ses modifications (🕐).
      </p>
    </div>
  );
}
