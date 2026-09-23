"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveObjectivesAction, type DdrActionResult } from "./actions";

const initialState: DdrActionResult = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Enregistrement…" : "Enregistrer les objectifs"}
    </button>
  );
}

export function ObjectivesEditor({ grantProjectId, initialObjectives }: { grantProjectId: string; initialObjectives: string[] }) {
  const action = saveObjectivesAction.bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);
  const [text, setText] = useState(initialObjectives.join("\n"));

  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="objectives"
        rows={Math.max(4, initialObjectives.length + 1)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Augmenter le taux de conversion autonome de 10 % à au moins 20 %\nAugmenter le taux d'engagement initial de 0,8 % à au moins 3,5 %\n..."}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <SaveButton />
        {state.ok && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
