"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { generateDdrScheduleAction, regenerateDdrRemainingAction, type DdrActionResult } from "./actions";

const initialState: DdrActionResult = { error: null };

function SubmitButton({ label, pendingLabel, disabled }: { label: string; pendingLabel: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? pendingLabel : label}
    </button>
  );
}

// Deux modes : « generate » (calendrier initial, une seule fois) et « regenerate » (ajuster le
// nombre de DDR restants -- les DDR déjà marqués déposés sont préservés, voir ddrReports.service.ts).
export function GenerateScheduleForm({
  grantProjectId,
  mode,
  disabled,
  defaultCount = 8,
  resumeDefaults = null,
}: {
  grantProjectId: string;
  mode: "generate" | "regenerate";
  disabled: boolean;
  defaultCount?: number;
  // Jade : dernier DDR déposé AVANT Apex (lu d'un rapport Historique DDR téléversé, s'il y en a un)
  // -- préremplit la reprise du calendrier à partir du DDR suivant.
  resumeDefaults?: { ddrNumber: number | null; periodEnd: string | null; balance: number | null; fromReport: boolean } | null;
}) {
  const action = (mode === "generate" ? generateDdrScheduleAction : regenerateDdrRemainingAction).bind(null, grantProjectId);
  const [state, formAction] = useFormState(action, initialState);
  const [count, setCount] = useState(String(defaultCount));
  const [resume, setResume] = useState(Boolean(resumeDefaults?.fromReport));
  const field = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {mode === "generate" && (
        <div className="w-full space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" name="resume" checked={resume} onChange={(e) => setResume(e.target.checked)} className="h-4 w-4" />
            Ce projet a déjà des DDR déposés avant Apex — reprendre à partir du suivant
          </label>
          {resume && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-neutral-600">
                  Dernier DDR déposé n°
                  <input name="resume_ddr_number" type="number" min={1} max={99} required defaultValue={resumeDefaults?.ddrNumber ?? ""} className={`ml-2 w-20 ${field}`} />
                </label>
                <label className="text-xs font-medium text-neutral-600">
                  Fin de sa période
                  <input name="resume_period_end" type="date" required defaultValue={resumeDefaults?.periodEnd ?? ""} className={`ml-2 ${field}`} />
                </label>
                <label className="text-xs font-medium text-neutral-600">
                  Solde restant après ce DDR ($, optionnel)
                  <input
                    name="resume_balance"
                    inputMode="decimal"
                    defaultValue={resumeDefaults?.balance != null ? String(resumeDefaults.balance) : ""}
                    placeholder="ex. 84 500"
                    className={`ml-2 w-32 ${field}`}
                  />
                </label>
              </div>
              <p className="text-xs text-neutral-500">
                {resumeDefaults?.fromReport
                  ? "Prérempli à partir du dernier rapport Historique DDR téléversé dans les Documents du dossier — vérifie, puis génère."
                  : "Astuce : téléverse le rapport « Historique DDR » de ce dernier DDR dans les Documents du dossier (catégorie Rapport DDR) : Apex lit le numéro, la période, les salariés et le solde restant, et préremplit ces champs."}{" "}
                Le calendrier commencera le lendemain de la fin de ce DDR, numéroté à la suite ; le « Nombre de DDR » ci-dessous = DDR restants à faire.
              </p>
            </>
          )}
        </div>
      )}
      <label className="text-xs font-medium text-neutral-600">
        {mode === "generate" ? (resume ? "Nombre de DDR restants à faire" : "Nombre de DDR") : "Nombre de DDR restants"}
        <input
          name="count"
          type="number"
          min={1}
          max={24}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="ml-2 w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>
      <SubmitButton
        label={mode === "generate" ? "Générer les DDR" : "Ajuster les DDR restants"}
        pendingLabel={mode === "generate" ? "Génération…" : "Ajustement…"}
        disabled={disabled}
      />
      {disabled && (
        <span className="text-xs text-amber-700">
          {mode === "generate" ? "Dates du projet et au moins un objectif requis." : "Date de fin du projet requise."}
        </span>
      )}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-700">Fait ✓</span>}
    </form>
  );
}
