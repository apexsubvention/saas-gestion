"use client";

// Jade (0065, PARI CNRC/IRAP) : « actualiser le montant restant facilement » -- ce solde est
// actualisé AUTOMATIQUEMENT à chaque rapport "Historique DDR" téléversé (voir
// analyzeUploadedDdrReport dans actions.ts), mais reste modifiable à la main ici, même idiome que
// EditableMilestoneTitle/EditableGrantProjectName (clic pour éditer, Entrée pour enregistrer,
// Échap pour annuler) -- juste deux champs (montant + libellé d'année financière) au lieu d'un
// seul.
import { useState, useTransition } from "react";
import { updatePariBalanceAction } from "./actions";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(n);
}

export function PariBalance({
  grantProjectId,
  initialRemaining,
  initialLabel,
  initialUpdatedAt,
}: {
  grantProjectId: string;
  initialRemaining: number | null;
  initialLabel: string | null;
  initialUpdatedAt: string | null;
}) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const [label, setLabel] = useState(initialLabel);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [editing, setEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState(initialRemaining != null ? String(initialRemaining) : "");
  const [draftLabel, setDraftLabel] = useState(initialLabel ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setEditing(false);
    setDraftAmount(remaining != null ? String(remaining) : "");
    setDraftLabel(label ?? "");
    setError(null);
  }

  function submit() {
    const cleaned = draftAmount.trim().replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
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
      setEditing(false);
    });
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Solde restant PARI{label ? ` — ${label}` : ""}</p>
      {!editing ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <button
            type="button"
            onClick={() => { setDraftAmount(remaining != null ? String(remaining) : ""); setDraftLabel(label ?? ""); setError(null); setEditing(true); }}
            className="text-lg font-semibold text-emerald-900 hover:underline"
            title="Modifier le solde restant"
          >
            {remaining != null ? fmtMoney(remaining) : "Non renseigné"}
          </button>
          {updatedAt && <span className="text-xs text-emerald-700">actualisé le {new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(updatedAt))}</span>}
        </div>
      ) : (
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
            placeholder="Année financière (ex. 2024-2025)"
            className="w-52 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") cancel(); }}
          />
          <button type="button" disabled={isPending} onClick={submit} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{isPending ? "…" : "OK"}</button>
          <button type="button" disabled={isPending} onClick={cancel} className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600">Annuler</button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-[11px] text-emerald-700">Actualisé automatiquement à chaque rapport « Historique DDR » téléversé (catégorie de document) -- modifiable ici à la main si besoin.</p>
    </div>
  );
}
