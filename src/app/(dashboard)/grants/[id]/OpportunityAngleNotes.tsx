"use client";

// Jade (0071, chantier 2) : quand un dossier est au statut « Opportunité à confirmer », le
// personnel écrit ici un texte libre (« angles possibles pour vous ») montré au client dans son
// portail (voir DossierCard.tsx), et voit la réponse du client (intéressé / ne convient pas) dès
// qu'elle arrive -- même idiome clic-pour-éditer que PariBalance.tsx.
import { useState, useTransition } from "react";
import { updateOpportunityAngleNotesAction } from "./actions";

const RESPONSE_LABELS: Record<string, string> = {
  interested: "Ce programme l'intéresse",
  not_interested: "Ce programme ne convient pas pour ses projets",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function OpportunityAngleNotes({
  grantProjectId,
  initialNotes,
  clientResponse,
  clientResponseAt,
}: {
  grantProjectId: string;
  initialNotes: string | null;
  clientResponse: "interested" | "not_interested" | null;
  clientResponseAt: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateOpportunityAngleNotesAction(grantProjectId, draft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotes(draft.trim());
      setEditing(false);
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-neutral-500">Angles possibles pour vous</p>
        <p className="mt-0.5 text-xs text-neutral-400">Ce texte est montré au client dans son portail tant que ce statut est actif.</p>
        {!editing ? (
          <div className="mt-1.5">
            {notes ? (
              <p className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800">{notes}</p>
            ) : (
              <p className="rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-400">Aucun texte pour l&apos;instant.</p>
            )}
            <button
              type="button"
              onClick={() => { setDraft(notes); setError(null); setEditing(true); }}
              className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline"
            >
              {notes ? "Modifier" : "Ajouter un texte"}
            </button>
          </div>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isPending}
              autoFocus
              rows={4}
              placeholder="Ex. Ce programme pourrait couvrir l'achat de votre nouvel équipement..."
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            />
            <div className="flex gap-1.5">
              <button type="button" disabled={isPending} onClick={submit} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" disabled={isPending} onClick={() => { setEditing(false); setError(null); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">
                Annuler
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

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
