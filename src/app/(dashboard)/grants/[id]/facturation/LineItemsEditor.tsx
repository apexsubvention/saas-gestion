"use client";

// Liste éditable des activités/postes budgétaires acceptés (source de vérité pour l'aide à la
// facturation) -- pré-remplie par la lecture automatique de la convention (UploadConventionForm),
// entièrement modifiable : corriger un montant lu par erreur, fusionner/scinder une ligne, ou tout
// saisir à la main si la lecture automatique échoue.
import { useState, useTransition } from "react";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
import { saveBillingLineItemsAction } from "./actions";

type Row = { key: string; label: string; description: string; amount: string; hours: string; included: boolean };

let nextKey = 0;
function newRow(): Row {
  nextKey += 1;
  return { key: `new-${nextKey}`, label: "", description: "", amount: "", hours: "", included: true };
}

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

export function LineItemsEditor({ grantProjectId, initialItems }: { grantProjectId: string; initialItems: BillingLineItemRow[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems.length > 0
      ? initialItems.map((it) => ({
          key: it.id,
          label: it.label,
          description: it.description ?? "",
          amount: String(it.amount ?? 0),
          hours: it.hours != null ? String(it.hours) : "",
          included: it.included_in_billing,
        }))
      : [newRow()]
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function save() {
    setError(null);
    setSaved(false);
    const kept = rows.filter((r) => r.label.trim().length > 0);
    const fd = new FormData();
    fd.set("item_count", String(kept.length));
    kept.forEach((r, i) => {
      fd.set(`item_label_${i}`, r.label);
      fd.set(`item_description_${i}`, r.description);
      fd.set(`item_amount_${i}`, r.amount);
      fd.set(`item_hours_${i}`, r.hours);
      fd.set(`item_included_${i}`, r.included ? "true" : "false");
    });
    startTransition(async () => {
      const res = await saveBillingLineItemsAction(grantProjectId, { error: null }, fd);
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className={`grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12 sm:items-start ${r.included ? "border-neutral-200" : "border-neutral-200 bg-neutral-50 opacity-70"}`}>
            <input placeholder="Activité / poste (ex. Formation employeur — Sitegrow)" value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} className={`${input} sm:col-span-4`} />
            <textarea placeholder="Détail (modules, heures, taux…)" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} className={`${input} sm:col-span-3`} rows={1} />
            <input placeholder="Montant $" type="number" min={0} step="0.01" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} className={`${input} sm:col-span-1`} />
            <input placeholder="Heures" type="number" min={0} step="0.5" value={r.hours} onChange={(e) => update(r.key, { hours: e.target.value })} className={`${input} sm:col-span-1`} />
            <label className="flex items-center gap-1.5 text-xs text-neutral-600 sm:col-span-2" title="Décoche pour un coût interne (ex. salaire) remboursé directement par la subvention, sans facture -- son montant n'entrera pas dans le total réparti sur les versements.">
              <input type="checkbox" checked={r.included} onChange={(e) => update(r.key, { included: e.target.checked })} />
              À facturer
            </label>
            <button type="button" onClick={() => removeRow(r.key)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 sm:col-span-1">
              Retirer
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Décoche un poste qui n&apos;est pas facturé au client (ex. un salaire interne remboursé directement par la subvention) -- seuls les postes cochés « À facturer » comptent dans le total réparti sur les versements.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addRow} className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
          + Ajouter une activité
        </button>
        <button type="button" onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer les activités"}
        </button>
        {saved && !pending && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
