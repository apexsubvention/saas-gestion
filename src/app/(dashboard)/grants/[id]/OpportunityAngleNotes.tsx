"use client";

// Jade (0071/0072, chantier 2) : quand un dossier est au statut « Opportunité à confirmer », le
// personnel écrit ici un texte libre (« angles possibles pour vous ») et une estimation propre à
// ce dossier (« potentiel $ qu'on peut aller chercher » + « % de remboursement » -- distincte du
// montant max / % générique du programme, déjà montrés via les règles figées, 0038) -- le tout
// montré au client dans son portail (voir DossierCard.tsx). Voit aussi la réponse du client
// (intéressé / ne convient pas) dès qu'elle arrive -- même idiome clic-pour-éditer que
// PariBalance.tsx, 3 champs enregistrés ensemble.
import { useState, useTransition } from "react";
import { updateOpportunityDetailsAction } from "./actions";

const RESPONSE_LABELS: Record<string, string> = {
  interested: "Ce programme l'intéresse",
  not_interested: "Ce programme ne convient pas pour ses projets",
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function fmtPercent(rate: number) {
  return `${Math.round(rate * 10000) / 100} %`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function OpportunityAngleNotes({
  grantProjectId,
  initialNotes,
  initialPotentialAmount,
  initialReimbursementRate,
  clientResponse,
  clientResponseAt,
}: {
  grantProjectId: string;
  initialNotes: string | null;
  initialPotentialAmount: number | null;
  initialReimbursementRate: number | null;
  clientResponse: "interested" | "not_interested" | null;
  clientResponseAt: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [potentialAmount, setPotentialAmount] = useState(initialPotentialAmount);
  const [reimbursementRate, setReimbursementRate] = useState(initialReimbursementRate);
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(initialNotes ?? "");
  const [draftAmount, setDraftAmount] = useState(initialPotentialAmount != null ? String(initialPotentialAmount) : "");
  const [draftRatePercent, setDraftRatePercent] = useState(initialReimbursementRate != null ? String(Math.round(initialReimbursementRate * 10000) / 100) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraftNotes(notes);
    setDraftAmount(potentialAmount != null ? String(potentialAmount) : "");
    setDraftRatePercent(reimbursementRate != null ? String(Math.round(reimbursementRate * 10000) / 100) : "");
    setError(null);
    setEditing(true);
  }

  function submit() {
    const cleanedAmount = draftAmount.trim().replace(/\s| /g, "").replace(",", ".").replace(/\$/g, "");
    const amountValue = cleanedAmount ? Number(cleanedAmount) : null;
    if (cleanedAmount && (!Number.isFinite(amountValue) || Number.isNaN(amountValue))) {
      setError("Montant invalide.");
      return;
    }
    const cleanedRate = draftRatePercent.trim().replace(",", ".").replace(/%/g, "");
    const rateValue = cleanedRate ? Number(cleanedRate) : null;
    if (cleanedRate && (!Number.isFinite(rateValue) || Number.isNaN(rateValue))) {
      setError("Taux invalide.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateOpportunityDetailsAction(grantProjectId, {
        notes: draftNotes,
        potentialAmount: amountValue,
        reimbursementRatePercent: rateValue,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotes(draftNotes.trim());
      setPotentialAmount(amountValue);
      setReimbursementRate(rateValue != null ? Math.round((rateValue / 100) * 10000) / 10000 : null);
      setEditing(false);
    });
  }

  return (
    <div className="space-y-3">
      {!editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Potentiel $ à aller chercher</p>
              <p className="text-neutral-800">{potentialAmount != null ? fmtMoney(potentialAmount) : "Non renseigné"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">% de remboursement</p>
              <p className="text-neutral-800">{reimbursementRate != null ? fmtPercent(reimbursementRate) : "Non renseigné"}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500">Angles possibles pour vous</p>
            {notes ? (
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800">{notes}</p>
            ) : (
              <p className="mt-1 rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-400">Aucun texte pour l&apos;instant.</p>
            )}
          </div>
          <button type="button" onClick={startEditing} className="text-xs font-medium text-indigo-600 hover:underline">
            Modifier
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">Potentiel $ à aller chercher</label>
              <input
                inputMode="decimal"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                disabled={isPending}
                placeholder="Montant $"
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">% de remboursement</label>
              <input
                inputMode="decimal"
                value={draftRatePercent}
                onChange={(e) => setDraftRatePercent(e.target.value)}
                disabled={isPending}
                placeholder="Ex. 50"
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Angles possibles pour vous</label>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              disabled={isPending}
              rows={4}
              placeholder="Ex. Ce programme pourrait couvrir l'achat de votre nouvel équipement..."
              className="mt-0.5 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div className="flex gap-1.5">
            <button type="button" disabled={isPending} onClick={submit} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" disabled={isPending} onClick={() => setEditing(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">
              Annuler
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <p className="text-xs font-medium text-neutral-500">Réponse du client</p>
        {clientResponse ? (
          <p className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${clientResponse === "interested" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {RESPONSE_LABELS[clientResponse]}
            {clientResponseAt && ` — ${formatDateTime(clientResponseAt)}`}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-neutral-400">Aucune réponse pour l&apos;instant.</p>
        )}
      </div>
    </div>
  );
}
