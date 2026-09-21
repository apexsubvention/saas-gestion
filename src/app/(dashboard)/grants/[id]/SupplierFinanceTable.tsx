"use client";

import { useState, useTransition } from "react";
import { setSupplierOverrideAction } from "./supplierActions";
import type { LedgerSupplier, Tracked } from "@/server/services/supplierLedger.service";

type ClientOption = { id: string; name: string };
type DocOption = { id: string; filename: string };

function money(n: number | null | undefined) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

const MODE_BADGE: Record<Tracked["mode"], { label: string; className: string } | null> = {
  auto: { label: "AUTO", className: "bg-emerald-50 text-emerald-700" },
  calculated: { label: "CALCULÉE", className: "bg-slate-100 text-slate-600" },
  manual: { label: "MODIFIÉE MANUELLEMENT", className: "bg-amber-100 text-amber-800" },
  none: null,
};

// Une valeur suivie : effective + mention AUTO / CALCULÉE / MODIFIÉE MANUELLEMENT, modification à la
// main et « Revenir au calcul automatique » (la valeur automatique n'est jamais détruite).
function TrackedCell({ grantProjectId, supplierId, field, tracked }: { grantProjectId: string; supplierId: string; field: "accepted" | "claimed"; tracked: Tracked }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tracked.effective != null ? String(tracked.effective) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = MODE_BADGE[tracked.mode];

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

export function SupplierFinanceTable({
  grantProjectId,
  suppliers,
  totals,
  documents,
  clients,
}: {
  grantProjectId: string;
  suppliers: LedgerSupplier[];
  totals: { budget: number; accepted: number; claimed: number; remaining: number };
  documents: DocOption[];
  clients: ClientOption[];
}) {
  if (suppliers.length === 0) return null;
  const docName = (id: string | null) => documents.find((d) => d.id === id)?.filename ?? null;
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900">Suivi financier des fournisseurs</h3>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Budget prévu</th>
              <th className="px-3 py-2 font-medium">Subvention acceptée</th>
              <th className="px-3 py-2 font-medium">Réclamé à ce jour</th>
              <th className="px-3 py-2 font-medium">Solde de subvention restant</th>
              <th className="px-3 py-2 font-medium">Facturation</th>
              <th className="px-3 py-2 font-medium">Client Apex lié</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => {
              const doc = docName(s.source_document_id);
              return (
                <tr key={s.id} className="border-b border-neutral-100 align-top">
                  <td className="px-3 py-2 font-medium text-neutral-900">{s.name}</td>
                  <td className="px-3 py-2 text-neutral-700">{money(s.budget_amount != null ? Number(s.budget_amount) : null)}</td>
                  <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} supplierId={s.id} field="accepted" tracked={s.accepted} /></td>
                  <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} supplierId={s.id} field="claimed" tracked={s.claimed} /></td>
                  <td className={`px-3 py-2 font-semibold ${s.remaining != null && s.remaining < 0 ? "text-red-700" : "text-neutral-900"}`}>{money(s.remaining)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {[s.billing_frequency, s.expected_invoice_day != null ? `jour ${s.expected_invoice_day}` : null].filter(Boolean).join(" · ") || "—"}
                    {s.invoice_description_requirements && <div className="mt-0.5 text-neutral-400">{s.invoice_description_requirements}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{clientName(s.supplier_client_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {s.source_kind ? SOURCE_LABELS[s.source_kind] ?? s.source_kind : "—"}
                    {s.source_ref && <div>{s.source_ref}</div>}
                    {doc && <div className="truncate text-neutral-400">{doc}</div>}
                    {s.confidence && <div className="text-neutral-400">{CONFIDENCE_LABELS[s.confidence]}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-neutral-300 bg-neutral-50 text-sm font-semibold text-neutral-900">
            <tr>
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2">{money(totals.budget)}</td>
              <td className="px-3 py-2">{money(totals.accepted)}</td>
              <td className="px-3 py-2">{money(totals.claimed)}</td>
              <td className="px-3 py-2">{money(totals.remaining)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-neutral-400">
        Solde restant = subvention acceptée − réclamé à ce jour. « Réclamé » vient automatiquement des réclamations liées aux factures du fournisseur ;
        clique sur un montant pour le modifier à la main (mention « modifiée manuellement »), puis « Revenir au calcul automatique » pour annuler. Fréquence,
        jour attendu et client lié se modifient dans « Détails » du tableau ci-dessous.
      </p>
    </div>
  );
}
