"use client";

// Liste éditable des activités/postes budgétaires acceptés (source de vérité pour l'aide à la
// facturation) -- pré-remplie par la lecture automatique de la convention (UploadConventionForm),
// entièrement modifiable : corriger un montant lu par erreur, fusionner/scinder une ligne, ou tout
// saisir à la main si la lecture automatique échoue.
import { useState, useTransition } from "react";
import type { BillingLineItemRow } from "@/server/repositories/billingLineItems.repository";
import { saveBillingLineItemsAction } from "./actions";

type Row = { key: string; label: string; description: string; amount: string; hours: string; included: boolean; exclusionReason: string; supplierId: string; subsidyRatePercent: string };

let nextKey = 0;
function newRow(): Row {
  nextKey += 1;
  return { key: `new-${nextKey}`, label: "", description: "", amount: "", hours: "", included: true, exclusionReason: "", supplierId: "", subsidyRatePercent: "" };
}

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

// Jade (0058) : pourquoi un poste est décoché -- simple aide-mémoire, aucun montant n'est déplacé
// automatiquement (une redistribution ou un nouveau fournisseur se fait à la main, dans le
// tableau Fournisseurs et factures juste en dessous sur le Dossier).
const EXCLUSION_REASON_LABELS: Record<string, string> = {
  internal_salary: "Salaire interne (non facturé)",
  redistribute_supplier: "À redistribuer à un autre fournisseur",
  new_supplier: "Nécessite l'ajout d'un nouveau fournisseur",
};

export function LineItemsEditor({
  grantProjectId,
  initialItems,
  suppliers,
}: {
  grantProjectId: string;
  initialItems: BillingLineItemRow[];
  // Jade (0059) : associer un poste à un fournisseur -- coché "À facturer" + associé, son montant
  // alimente automatiquement le "Budget prévu" de ce fournisseur dans le tableau Fournisseurs du
  // Dossier (voir supplierLedger.service). Liste des fournisseurs déjà créés sur CE dossier.
  suppliers: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems.length > 0
      ? initialItems.map((it) => ({
          key: it.id,
          label: it.label,
          description: it.description ?? "",
          amount: String(it.amount ?? 0),
          hours: it.hours != null ? String(it.hours) : "",
          included: it.included_in_billing,
          exclusionReason: it.exclusion_reason ?? "",
          supplierId: it.supplier_id ?? "",
          subsidyRatePercent: it.subsidy_rate != null ? String(Math.round(it.subsidy_rate * 10000) / 100) : "",
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
      fd.set(`item_exclusion_reason_${i}`, r.exclusionReason);
      fd.set(`item_supplier_id_${i}`, r.supplierId);
      fd.set(`item_subsidy_rate_${i}`, r.subsidyRatePercent);
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
              <input
                type="checkbox"
                checked={r.included}
                onChange={(e) => update(r.key, { included: e.target.checked, exclusionReason: e.target.checked ? "" : r.exclusionReason })}
              />
              À facturer
            </label>
            {!r.included && (
              <select
                value={r.exclusionReason}
                onChange={(e) => update(r.key, { exclusionReason: e.target.value })}
                className={`${input} sm:col-span-2`}
                title="Pourquoi ce poste n'est pas facturé -- aide-mémoire seulement, aucun montant n'est déplacé automatiquement."
              >
                <option value="">Pourquoi ? (facultatif)</option>
                {Object.entries(EXCLUSION_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            )}
            <select
              value={r.supplierId}
              onChange={(e) => update(r.key, { supplierId: e.target.value })}
              className={`${input} sm:col-span-3`}
              title="Une fois associé, et si ce poste est coché « À facturer », son montant s'ajoute automatiquement au « Budget prévu » de ce fournisseur dans le tableau Fournisseurs du Dossier."
            >
              <option value="">Fournisseur (optionnel)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              placeholder="Taux d'aide (%)"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={r.subsidyRatePercent}
              onChange={(e) => update(r.key, { subsidyRatePercent: e.target.value })}
              className={`${input} sm:col-span-2`}
              title="Optionnel -- remplace le taux d'aide du dossier pour ce poste précis (ex. une convention où la formation est subventionnée à un taux différent du taux global). Vide = utilise le taux du dossier."
            />
            <button type="button" onClick={() => removeRow(r.key)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 sm:col-span-1">
              Retirer
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Décoche un poste qui n&apos;est pas facturé au client (ex. un salaire interne remboursé directement par la subvention) -- seuls les postes cochés « À facturer » comptent dans le total réparti sur les versements. Associe un poste coché à un fournisseur pour que son montant apparaisse dans le « Budget prévu » de ce fournisseur, dans le tableau Fournisseurs du Dossier. Taux d&apos;aide (%) : à remplir seulement si ce poste précis a un taux différent du taux global du dossier (ex. une convention qui subventionne la formation à 85 % mais dont le taux global du projet, tous frais confondus, est différent) -- laisse vide pour utiliser le taux du dossier.
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
