"use client";

// Jade (0065, PARI CNRC/IRAP) : « actualiser le montant restant facilement » -- ce solde est
// actualisé AUTOMATIQUEMENT à chaque rapport "Historique DDR" téléversé (voir
// analyzeUploadedDdrReport dans actions.ts), et modifiable à la main (clic pour éditer, Entrée pour
// enregistrer, Échap pour annuler).
//
// Jade (0078) : « pouvoir ajuster le solde restant à réclamer manuellement, indépendant des
// réclamations ou factures » -- un montant saisi ici est VERROUILLÉ : les rapports DDR lus ensuite
// ne le remplacent plus, jusqu'à « Revenir à l'automatique ». Deux présentations : l'encadré vert
// (section Fournisseurs et factures) et « header » (la case Solde de l'en-tête du dossier).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPariBalanceAutoAction, updatePariBalanceAction } from "./actions";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
}
const fmtDate = (iso: string) => new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export function PariBalance({
  grantProjectId,
  initialRemaining,
  initialLabel,
  initialUpdatedAt,
  initialManual = false,
  fallbackRemaining = null,
  variant = "panel",
}: {
  grantProjectId: string;
  initialRemaining: number | null;
  initialLabel: string | null;
  initialUpdatedAt: string | null;
  initialManual?: boolean;
  // En-tête : montant affiché tant qu'aucun solde n'est connu (calcul d'après l'entente).
  fallbackRemaining?: number | null;
  variant?: "panel" | "header";
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [label, setLabel] = useState(initialLabel);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [manual, setManual] = useState(initialManual);
  const [editing, setEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState(initialRemaining != null ? String(initialRemaining) : "");
  const [draftLabel, setDraftLabel] = useState(initialLabel ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Les deux présentations sont sur la même page : se resynchroniser après router.refresh().
  useEffect(() => {
    setRemaining(initialRemaining);
    setLabel(initialLabel);
    setUpdatedAt(initialUpdatedAt);
    setManual(initialManual);
  }, [initialRemaining, initialLabel, initialUpdatedAt, initialManual]);

  function startEditing() {
    setDraftAmount(remaining != null ? String(remaining) : "");
    setDraftLabel(label ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraftAmount(remaining != null ? String(remaining) : "");
    setDraftLabel(label ?? "");
    setError(null);
  }

  function submit() {
    const cleaned = draftAmount.trim().replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
    const value = cleaned ? Number(cleaned) : null;
    if (cleaned && (!Number.isFinite(value) || Number.isNaN(value))) {
      setError("Montant invalide.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePariBalanceAction(grantProjectId, value, draftLabel.trim() || null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRemaining(value);
      setLabel(draftLabel.trim() || null);
      setUpdatedAt(new Date().toISOString());
      setManual(value != null);
      setEditing(false);
      router.refresh();
    });
  }

  function backToAuto() {
    setError(null);
    startTransition(async () => {
      const result = await resetPariBalanceAutoAction(grantProjectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setManual(false);
      router.refresh();
    });
  }

  const editor = (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <input
        inputMode="decimal"
        value={draftAmount}
        onChange={(e) => setDraftAmount(e.target.value)}
        disabled={isPending}
        autoFocus
        placeholder="Montant $"
        className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") cancel(); }}
      />
      <input
        value={draftLabel}
        onChange={(e) => setDraftLabel(e.target.value)}
        disabled={isPending}
        placeholder="Année financière (ex. 2026-2027)"
        className="w-52 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") cancel(); }}
      />
      <button type="button" disabled={isPending} onClick={submit} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{isPending ? "…" : "OK"}</button>
      <button type="button" disabled={isPending} onClick={cancel} className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600">Annuler</button>
    </div>
  );

  const backToAutoButton = manual && (
    <button type="button" disabled={isPending} onClick={backToAuto} className="text-[11px] text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50">
      Revenir à l&apos;automatique
    </button>
  );

  if (variant === "header") {
    const shown = remaining ?? fallbackRemaining;
    return (
      <div>
        <p className="text-xs text-neutral-400">Solde restant PARI{label ? ` — ${label}` : ""}</p>
        {!editing ? (
          <button type="button" onClick={startEditing} className="text-sm font-medium text-neutral-900 hover:underline" title="Ajuster le solde restant à la main">
            {shown != null ? fmtMoney(shown) : "Non renseigné"} <span className="text-[11px] font-normal text-neutral-400">✎</span>
          </button>
        ) : (
          editor
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-neutral-400">{manual ? "Fixé à la main" : remaining != null ? "D'après le dernier rapport DDR" : "Estimé d'après l'entente"}</span>
          {backToAutoButton}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Solde restant PARI{label ? ` — ${label}` : ""}</p>
      {!editing ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <button type="button" onClick={startEditing} className="text-lg font-semibold text-emerald-900 hover:underline" title="Modifier le solde restant">
            {remaining != null ? fmtMoney(remaining) : "Non renseigné"}
          </button>
          {updatedAt && <span className="text-xs text-emerald-700">{manual ? "fixé à la main" : "actualisé"} le {fmtDate(updatedAt)}</span>}
          {backToAutoButton}
        </div>
      ) : (
        editor
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-[11px] text-emerald-700">
        {manual
          ? "Montant fixé à la main : il ne change plus avec les rapports DDR, réclamations ou factures. « Revenir à l'automatique » pour que le prochain rapport « Historique DDR » le remplace."
          : "Actualisé automatiquement à chaque rapport « Historique DDR » téléversé. Cliquez sur le montant pour le fixer à la main (il ne changera alors plus tout seul)."}
      </p>
    </div>
  );
}
