"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send, CheckCircle2 } from "lucide-react";
import { sendOpportunityInterestAction, type SendOpportunityInterestFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      <Send className="h-3.5 w-3.5" />
      {pending ? "Envoi..." : "Envoyer à Apex"}
    </button>
  );
}

// Déjà envoyé lors d'une visite précédente (rechargement de page) -- pas de formulaire, juste l'état.
export function AlreadySentBadge({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Envoyé à Apex · {statusLabel}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  new: "en attente de retour",
  viewed: "vu par Apex",
  contacted: "Apex t'a contacté",
  dismissed: "classé par Apex",
};

// alreadySentStatus vient du serveur (chargé avec la page, voir page.tsx) : si un envoi existe déjà
// pour cette opportunité, la case affiche directement l'état confirmé, sans attendre une action.
export function SendInterestForm({ opportunityId, alreadySentStatus }: { opportunityId: string; alreadySentStatus?: string | null }) {
  const initialState: SendOpportunityInterestFormState = { error: null };
  const [state, formAction] = useFormState(sendOpportunityInterestAction, initialState);
  const [expanded, setExpanded] = useState(false);

  if (alreadySentStatus || state.ok) {
    return <AlreadySentBadge statusLabel={STATUS_LABELS[alreadySentStatus ?? "new"] ?? "en attente de retour"} />;
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
      >
        <Send className="h-3.5 w-3.5" />
        Cette opportunité m&apos;intéresse
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <label className="block text-xs font-medium text-slate-600">
        Un mot pour Apex (optionnel)
      </label>
      <textarea
        name="note"
        rows={2}
        maxLength={2000}
        placeholder="Ex. je pense que ça pourrait s'appliquer à mon projet de formation..."
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-300"
      />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex items-center gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
