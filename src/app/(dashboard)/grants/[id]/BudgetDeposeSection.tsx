"use client";

// Section « Ce qui a été déposé » (0068) : budget déposé, sous-traitants, montant accepté, % de
// subvention par poste de dépenses -- soit généré depuis la convention (bouton ci-dessous), soit
// saisi à la main, toujours modifiable ensuite (même pattern Tracked auto/override que le tableau
// Fournisseurs, voir SuppliersTable.tsx#TrackedCell -- réimplémenté ici pour les nouveaux champs).
// Distincte de « Aide à la facturation » (billing_line_items) : deux tableaux, jamais fusionnés
// (décision explicite de Jade), même si les montants se ressemblent souvent en pratique.
import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createBudgetLineAction,
  deleteBudgetLineAction,
  generateBudgetLinesFromConventionAction,
  setBudgetLineOverrideAction,
  updateBudgetLineAction,
  updateProjectFinancialsAction,
  type BudgetLineActionResult,
} from "./budgetLineActions";
import type { BudgetLineView } from "@/server/services/budgetLines.service";
import type { Tracked } from "@/server/services/supplierLedger.service";

type SupplierOption = { id: string; name: string };

function money(n: number | null | undefined) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
}
function pct(n: number | null | undefined) {
  return n == null ? "—" : `${(Math.round(n * 10000) / 100).toLocaleString("fr-CA")} %`;
}
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const smallBtn = "rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

const MODE_BADGE: Record<Tracked["mode"], { label: string; className: string } | null> = {
  auto: { label: "AUTO", className: "bg-emerald-50 text-emerald-700" },
  calculated: { label: "CALCULÉE", className: "bg-slate-100 text-slate-600" },
  manual: { label: "MODIFIÉE MANUELLEMENT", className: "bg-amber-100 text-amber-800" },
  none: null,
};

function useLedgerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<BudgetLineActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else onDone?.();
    });
  }
  return { pending, error, run };
}

// Une valeur suivie (montant ou taux) : effective + AUTO/CALCULÉE/MODIFIÉE MANUELLEMENT, modifiable
// à la main, « Revenir au calcul automatique » (la valeur automatique n'est jamais détruite).
function TrackedCell({ grantProjectId, lineId, field, tracked, isPercent }: { grantProjectId: string; lineId: string; field: "deposited" | "accepted" | "rate"; tracked: Tracked; isPercent?: boolean }) {
  const [editing, setEditing] = useState(false);
  const displayValue = isPercent && tracked.effective != null ? Math.round(tracked.effective * 10000) / 100 : tracked.effective;
  const [text, setText] = useState(displayValue != null ? String(displayValue) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = MODE_BADGE[tracked.mode];

  function run(value: number | null) {
    setError(null);
    startTransition(async () => {
      const r = await setBudgetLineOverrideAction(grantProjectId, lineId, field, value);
      if (r.error) setError(r.error);
      else setEditing(false);
    });
  }

  function save() {
    const v = parseAmount(text);
    if (v == null || Number.isNaN(v)) return setError("Valeur invalide.");
    if (isPercent && (v < 0 || v > 100)) return setError("Taux invalide (0 à 100).");
    run(isPercent ? Math.round((v / 100) * 10000) / 10000 : v);
  }

  const autoDisplay = isPercent && tracked.auto != null ? pct(tracked.auto) : money(tracked.auto);

  return (
    <div className="space-y-1">
      {editing ? (
        <div className="flex items-center gap-1">
          <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" autoFocus />
          <button onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{pending ? "…" : "OK"}</button>
          <button onClick={() => setEditing(false)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">Annuler</button>
        </div>
      ) : (
        <button
          onClick={() => { setText(displayValue != null ? String(displayValue) : ""); setEditing(true); }}
          className="text-left text-sm font-medium text-neutral-900 hover:underline"
          title="Modifier à la main"
        >
          {isPercent ? pct(tracked.effective) : money(tracked.effective)}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
        {tracked.mode === "manual" && (
          <button onClick={() => run(null)} disabled={pending} className="text-[11px] text-blue-600 underline disabled:opacity-50" title={tracked.auto != null ? `Valeur automatique : ${autoDisplay}` : undefined}>
            Revenir au calcul automatique{tracked.auto != null ? ` (${autoDisplay})` : ""}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function BudgetLineRow({ grantProjectId, line, suppliers }: { grantProjectId: string; line: BudgetLineView; suppliers: SupplierOption[] }) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [category, setCategory] = useState(line.category);
  const [supplierId, setSupplierId] = useState(line.supplierId ?? "");
  const { pending, error, run } = useLedgerAction();

  function saveHeader() {
    if (!category.trim()) return;
    run(() => updateBudgetLineAction(grantProjectId, line.id, category, supplierId || null), () => setEditingHeader(false));
  }

  return (
    <tr className="border-b border-neutral-100 bg-white align-top">
      <td className="px-3 py-2">
        {editingHeader ? (
          <div className="space-y-1">
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={`${input} font-medium`} />
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
              <option value="">Aucun sous-traitant</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-1">
              <button onClick={saveHeader} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer"}</button>
              <button onClick={() => { setCategory(line.category); setSupplierId(line.supplierId ?? ""); setEditingHeader(false); }} className={smallBtn}>Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingHeader(true)} className="text-left hover:underline">
            <span className="font-medium text-neutral-900">{line.category}</span>
            <span className="mt-0.5 block text-xs text-neutral-400">{line.supplierName ?? "Aucun sous-traitant associé"}</span>
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} lineId={line.id} field="rate" tracked={line.rate} isPercent /></td>
      <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} lineId={line.id} field="deposited" tracked={line.deposited} /></td>
      <td className="px-3 py-2"><TrackedCell grantProjectId={grantProjectId} lineId={line.id} field="accepted" tracked={line.accepted} /></td>
      <td className="px-3 py-2">
        <button
          onClick={() => { if (confirm(`Supprimer le poste « ${line.category} » ?`)) run(() => deleteBudgetLineAction(grantProjectId, line.id)); }}
          disabled={pending}
          className={`${smallBtn} text-red-700`}
        >
          Supprimer
        </button>
      </td>
    </tr>
  );
}

function AddBudgetLineRow({ grantProjectId, suppliers }: { grantProjectId: string; suppliers: SupplierOption[] }) {
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [deposited, setDeposited] = useState("");
  const [accepted, setAccepted] = useState("");
  const [rate, setRate] = useState("");
  const { pending, error, run } = useLedgerAction();

  function add() {
    const dep = deposited.trim() ? parseAmount(deposited) : null;
    if (dep != null && Number.isNaN(dep)) return run(async () => ({ error: "Montant déposé invalide." }));
    const acc = accepted.trim() ? parseAmount(accepted) : null;
    if (acc != null && Number.isNaN(acc)) return run(async () => ({ error: "Montant accepté invalide." }));
    const r = rate.trim() ? Number(rate) : null;
    if (r != null && !Number.isFinite(r)) return run(async () => ({ error: "Taux invalide." }));
    run(
      () => createBudgetLineAction(grantProjectId, { category, supplier_id: supplierId || null, deposited_amount: dep, accepted_amount: acc, subsidy_rate_percent: r }),
      () => { setCategory(""); setSupplierId(""); setDeposited(""); setAccepted(""); setRate(""); }
    );
  }

  return (
    <tr className="bg-neutral-50">
      <td className="px-3 py-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Nouveau poste (ex. Salaires)" className={`${input} mb-1`} />
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
          <option value="">Aucun sous-traitant</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="% (optionnel)" className={input} /></td>
      <td className="px-3 py-2"><input inputMode="decimal" value={deposited} onChange={(e) => setDeposited(e.target.value)} placeholder="Déposé $" className={input} /></td>
      <td className="px-3 py-2"><input inputMode="decimal" value={accepted} onChange={(e) => setAccepted(e.target.value)} placeholder="Accepté $" className={input} /></td>
      <td className="px-3 py-2">
        <button onClick={add} disabled={pending || !category.trim()} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "+ Ajouter"}</button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

const initialGenState: BudgetLineActionResult = { error: null };

// Jade : bouton dans un sous-composant séparé -- useFormStatus() ne lit le statut « en cours » que
// pour un descendant du <form>, jamais pour le composant qui rend le <form> lui-même (même
// précaution que UploadConventionForm.tsx#SubmitButton, aide à la facturation).
function GenerateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Envoi et lecture…" : "Générer depuis la convention"}
    </button>
  );
}

function GenerateFromConventionForm({ grantProjectId }: { grantProjectId: string }) {
  const action = generateBudgetLinesFromConventionAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialGenState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Ceci relit la convention et met à jour les postes générés automatiquement (les corrections manuelles déjà faites sont conservées). Continuer ?")) e.preventDefault();
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-neutral-300 p-3"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Convention (PDF ou image)</label>
        <input name="file" type="file" accept=".pdf,image/*" required className="text-sm" />
      </div>
      <GenerateSubmitButton />
      {state.info && !state.error && <span className="text-xs text-emerald-700">{state.info}</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

const initialFinState = { error: null };

function SimpleModeFinancials({ grantProjectId, totalProjectCost, approvedGrantAmount, grantRatePercent }: { grantProjectId: string; totalProjectCost: number | null; approvedGrantAmount: number | null; grantRatePercent: number | null }) {
  const [total, setTotal] = useState(totalProjectCost != null ? String(totalProjectCost) : "");
  const [approved, setApproved] = useState(approvedGrantAmount != null ? String(approvedGrantAmount) : "");
  const [rate, setRate] = useState(grantRatePercent != null ? String(grantRatePercent) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = total !== (totalProjectCost != null ? String(totalProjectCost) : "") || approved !== (approvedGrantAmount != null ? String(approvedGrantAmount) : "") || rate !== (grantRatePercent != null ? String(grantRatePercent) : "");

  function save() {
    setError(null);
    const t = total.trim() ? parseAmount(total) : null;
    const a = approved.trim() ? parseAmount(approved) : null;
    const r = rate.trim() ? Number(rate) : null;
    if ((t != null && Number.isNaN(t)) || (a != null && Number.isNaN(a)) || (r != null && !Number.isFinite(r))) return setError("Valeur invalide.");
    setSaved(false);
    startTransition(async () => {
      const res = await updateProjectFinancialsAction(grantProjectId, { total_project_cost: t, approved_grant_amount: a, grant_rate_percent: r });
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-neutral-300 bg-white p-3">
      <p className="text-xs text-neutral-500">
        Aucun poste détaillé pour l&apos;instant -- saisis les totaux du dossier ici (mode simple), ou génère/ajoute des postes ci-dessous pour un
        suivi plus précis par catégorie de dépense.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-neutral-600">Coût total du projet
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={input} />
        </label>
        <label className="space-y-1 text-xs text-neutral-600">Montant approuvé (subvention max.)
          <input inputMode="decimal" value={approved} onChange={(e) => setApproved(e.target.value)} className={input} />
        </label>
        <label className="space-y-1 text-xs text-neutral-600">Taux d&apos;aide global (%)
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {dirty && <button onClick={save} disabled={pending} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-800`}>{pending ? "…" : "Enregistrer"}</button>}
        {!dirty && saved && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md p-3 ${strong ? "bg-indigo-50 ring-1 ring-indigo-100" : "bg-neutral-50"}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-0.5 font-semibold ${strong ? "text-lg text-indigo-900" : "text-sm text-neutral-900"}`}>{value}</div>
    </div>
  );
}

export function BudgetDeposeSection({
  grantProjectId,
  lines,
  totals,
  suppliers,
  totalProjectCost,
  approvedGrantAmount,
  grantRatePercent,
}: {
  grantProjectId: string;
  lines: BudgetLineView[];
  totals: { deposited: number; accepted: number };
  suppliers: SupplierOption[];
  // Repli « mode simple » (aucun poste détaillé) -- valeurs déjà résolues par la page (fiche du
  // dossier en priorité, sinon l'entente -- même ordre que resolveSubsidyInputs).
  totalProjectCost: number | null;
  approvedGrantAmount: number | null;
  grantRatePercent: number | null;
}) {
  const hasLines = lines.length > 0;
  const totalDeposited = hasLines ? totals.deposited : totalProjectCost;
  const totalAccepted = hasLines ? totals.accepted : approvedGrantAmount;
  const netOfSubsidy = totalDeposited != null && totalAccepted != null ? totalDeposited - totalAccepted : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Coût total du projet (avec subvention)" value={money(totalDeposited)} />
        <Stat label="Subvention maximale" value={money(totalAccepted)} strong />
        <Stat label="Reste à la charge du client (sans subvention)" value={money(netOfSubsidy)} />
        <Stat label="Taux global" value={grantRatePercent != null ? `${grantRatePercent.toLocaleString("fr-CA")} %` : "—"} />
      </div>

      <GenerateFromConventionForm grantProjectId={grantProjectId} />

      {!hasLines && (
        <SimpleModeFinancials grantProjectId={grantProjectId} totalProjectCost={totalProjectCost} approvedGrantAmount={approvedGrantAmount} grantRatePercent={grantRatePercent} />
      )}

      {hasLines && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Poste / sous-traitant</th>
                <th className="px-3 py-2 font-medium">% subvention</th>
                <th className="px-3 py-2 font-medium">Déposé</th>
                <th className="px-3 py-2 font-medium">Accepté</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <BudgetLineRow key={l.id} grantProjectId={grantProjectId} line={l} suppliers={suppliers} />
              ))}
              <AddBudgetLineRow grantProjectId={grantProjectId} suppliers={suppliers} />
            </tbody>
            <tfoot className="border-t border-neutral-300 bg-neutral-50 text-sm font-semibold text-neutral-900">
              <tr>
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">{money(totals.deposited)}</td>
                <td className="px-3 py-2">{money(totals.accepted)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {hasLines && (
        <AddBudgetLineRowHintFooter />
      )}
    </div>
  );
}

function AddBudgetLineRowHintFooter() {
  return (
    <p className="text-xs text-neutral-400">
      Chaque valeur (% subvention, déposé, accepté) reste modifiable à la main même après une génération automatique -- clique sur le montant,
      puis « Revenir au calcul automatique » pour annuler ta correction (la valeur lue automatiquement n&apos;est jamais perdue). « Générer depuis
      la convention » ci-dessus peut être relancé sans risque : il ne touche jamais un poste déjà corrigé à la main.
    </p>
  );
}
