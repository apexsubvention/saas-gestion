"use client";

// Un DDR = une carte éditable : entête (calendrier/entreprise), Activités et résultats, un bloc
// par objectif (avancement % + narratif), Variations, signature. Bouton « copier » par section
// (à coller dans le formulaire officiel / le Portail de l'innovation PARI CNRC) -- même mécanisme
// que le courriel de l'aide à la rédaction (DraftingWorkspace.tsx). Tout reste modifiable, y
// compris ce qu'Apex a rédigé automatiquement.
import { useState, useTransition } from "react";
import type { DdrReportRow } from "@/server/repositories/ddrReports.repository";
import { updateDdrReportAction, deleteDdrReportAction, setDdrStatusAction } from "./actions";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const textarea = `${input} min-h-[6rem]`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* copie manuelle si l'API presse-papier est indisponible */
        }
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
    >
      {copied ? "Copié ✓" : "Copier"}
    </button>
  );
}

export function DdrReportCard({ grantProjectId, report }: { grantProjectId: string; report: DdrReportRow }) {
  const [onSchedule, setOnSchedule] = useState(report.on_schedule);
  const [delayJustification, setDelayJustification] = useState(report.delay_justification ?? "");
  const [newEndDate, setNewEndDate] = useState(report.new_end_date ?? "");
  const [addressChanged, setAddressChanged] = useState(report.address_changed);
  const [companyNameChanged, setCompanyNameChanged] = useState(report.company_name_changed);
  const [activities, setActivities] = useState(report.activities_text ?? "");
  const [variations, setVariations] = useState(report.variations_text ?? "");
  const [objectives, setObjectives] = useState(report.objectives_snapshot);
  const [preparedByName, setPreparedByName] = useState(report.prepared_by_name ?? "");
  const [preparedByTitle, setPreparedByTitle] = useState(report.prepared_by_title ?? "");
  const [signatureDate, setSignatureDate] = useState(report.signature_date ?? "");
  const [open, setOpen] = useState(report.status === "draft");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("on_schedule", onSchedule ? "on" : "");
    fd.set("delay_justification", delayJustification);
    fd.set("new_end_date", newEndDate);
    fd.set("address_changed", addressChanged ? "on" : "");
    fd.set("company_name_changed", companyNameChanged ? "on" : "");
    fd.set("activities_text", activities);
    fd.set("variations_text", variations);
    fd.set("prepared_by_name", preparedByName);
    fd.set("prepared_by_title", preparedByTitle);
    fd.set("signature_date", signatureDate);
    objectives.forEach((o, i) => {
      fd.set(`objective_narrative_${i}`, o.narrative);
      fd.set(`objective_progress_${i}`, String(o.progress_percent ?? ""));
    });
    startTransition(async () => {
      const r = await updateDdrReportAction(grantProjectId, report.id, { error: null }, fd);
      if (r.error) setError(r.error);
      else setSaved(true);
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      await setDdrStatusAction(grantProjectId, report.id, report.status === "submitted" ? "draft" : "submitted");
    });
  }

  function remove() {
    if (!confirm(`Supprimer le DDR ${report.ddr_number} ?`)) return;
    startTransition(async () => {
      await deleteDdrReportAction(grantProjectId, report.id);
    });
  }

  const fullText = [
    `DDR n°${report.ddr_number} — période du ${report.period_start} au ${report.period_end}`,
    "",
    "Activités et résultats",
    activities,
    "",
    ...objectives.flatMap((o, i) => [`OBJECTIF ${i + 1} — ${o.label}`, `Avancement estimé : ${o.progress_percent ?? "—"} %`, o.narrative, ""]),
    "Variations aux objectifs, au plan de travail ou au budget initiaux",
    variations,
  ].join("\n");

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <span className="text-sm font-semibold text-neutral-900">DDR {report.ddr_number}</span>
          <span className="ml-2 text-xs text-neutral-500">
            {report.period_start} → {report.period_end}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${report.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {report.status === "submitted" ? "Déposé" : "Brouillon"}
          </span>
          <span className="text-xs text-neutral-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <CopyButton text={fullText} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleStatus} disabled={pending} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                {report.status === "submitted" ? "Marquer comme brouillon" : "Marquer comme déposé"}
              </button>
              <button type="button" onClick={remove} disabled={pending} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                Supprimer
              </button>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={onSchedule} onChange={(e) => setOnSchedule(e.target.checked)} />
              Le projet se termine dans les temps prévus
            </label>
            {!onSchedule && (
              <>
                <label className="space-y-1 text-xs font-medium text-neutral-600 sm:col-span-2">
                  Justification du délai
                  <textarea value={delayJustification} onChange={(e) => setDelayJustification(e.target.value)} className={textarea} />
                </label>
                <label className="space-y-1 text-xs font-medium text-neutral-600">
                  Nouvelle date de fin
                  <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className={input} />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={addressChanged} onChange={(e) => setAddressChanged(e.target.checked)} />
              Adresse de l&apos;entreprise changée
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={companyNameChanged} onChange={(e) => setCompanyNameChanged(e.target.checked)} />
              Dénomination sociale changée
            </label>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">Activités et résultats</h3>
              <CopyButton text={activities} />
            </div>
            <textarea value={activities} onChange={(e) => setActivities(e.target.value)} className={textarea} rows={5} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900">Objectifs</h3>
            {objectives.map((o, i) => (
              <div key={i} className="space-y-2 rounded-md border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-neutral-700">OBJECTIF {i + 1} — {o.label}</p>
                  <CopyButton text={`OBJECTIF ${i + 1} — ${o.label}\nAvancement estimé : ${o.progress_percent ?? "—"} %\n${o.narrative}`} />
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  Avancement estimé (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={o.progress_percent ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setObjectives((prev) => prev.map((x, idx) => (idx === i ? { ...x, progress_percent: v } : x)));
                    }}
                    className="w-20 rounded-md border border-neutral-300 px-2 py-1"
                  />
                </label>
                <textarea
                  value={o.narrative}
                  onChange={(e) => setObjectives((prev) => prev.map((x, idx) => (idx === i ? { ...x, narrative: e.target.value } : x)))}
                  className={textarea}
                  rows={3}
                />
              </div>
            ))}
            {objectives.length === 0 && <p className="text-xs text-neutral-400">Aucun objectif défini pour ce dossier.</p>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">Variations aux objectifs, au plan de travail ou au budget initiaux</h3>
              <CopyButton text={variations} />
            </div>
            <textarea value={variations} onChange={(e) => setVariations(e.target.value)} className={textarea} rows={3} />
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-medium text-neutral-600">
              Préparé par
              <input value={preparedByName} onChange={(e) => setPreparedByName(e.target.value)} className={input} />
            </label>
            <label className="space-y-1 text-xs font-medium text-neutral-600">
              Titre
              <input value={preparedByTitle} onChange={(e) => setPreparedByTitle(e.target.value)} className={input} />
            </label>
            <label className="space-y-1 text-xs font-medium text-neutral-600">
              Date de signature
              <input type="date" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} className={input} />
            </label>
          </section>

          <div className="flex items-center gap-2 border-t border-neutral-100 pt-3">
            <button type="button" onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Enregistrement…" : "Enregistrer ce DDR"}
            </button>
            {saved && !pending && <span className="text-xs text-emerald-700">Enregistré ✓</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
