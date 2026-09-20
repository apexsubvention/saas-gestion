"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScheduleEntry } from "@/features/schedule/buildScheduleRows";
import { PRIORITY_BUCKET_ORDER, type PriorityBucket } from "@/features/schedule/priority";
import { PRIORITY_BUCKET_LABELS, priorityBucketBadgeClass } from "@/features/grants/constants";

const KIND_LABELS: Record<ScheduleEntry["kind"], string> = { task: "Tâche", milestone: "Échéance", claim: "Réclamation" };
const KIND_BADGE: Record<ScheduleEntry["kind"], string> = {
  task: "bg-slate-100 text-slate-700",
  milestone: "bg-indigo-50 text-indigo-700",
  claim: "bg-emerald-50 text-emerald-700",
};

// Vue "ce qui demande mon attention" : sections empilées par seau d'urgence (voir
// src/features/schedule/priority.ts), chacune en cartes plutôt qu'en tableau pour
// pouvoir montrer client/dossier/programme/montant/éléments manquants d'un coup d'œil.
// Le seau "Terminé" est replié par défaut pour ne pas noyer ce qui presse.
export function PriorityView({ entries }: { entries: ScheduleEntry[] }) {
  const [doneOpen, setDoneOpen] = useState(false);

  const byBucket = new Map<PriorityBucket, ScheduleEntry[]>();
  for (const bucket of PRIORITY_BUCKET_ORDER) byBucket.set(bucket, []);
  for (const entry of entries) byBucket.get(entry.bucket)?.push(entry);

  const nonEmptyBuckets = PRIORITY_BUCKET_ORDER.filter((b) => (byBucket.get(b)?.length ?? 0) > 0);

  if (nonEmptyBuckets.length === 0) {
    return <p className="text-sm text-neutral-400">Rien pour l&apos;instant.</p>;
  }

  return (
    <div className="space-y-6">
      {nonEmptyBuckets.map((bucket) => {
        const items = byBucket.get(bucket) ?? [];
        const isDone = bucket === "done";

        return (
          <section key={bucket}>
            {isDone ? (
              <button
                type="button"
                onClick={() => setDoneOpen((v) => !v)}
                className="flex items-center gap-2"
              >
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBucketBadgeClass(bucket)}`}>
                  {PRIORITY_BUCKET_LABELS[bucket]}
                </span>
                <span className="text-xs text-neutral-400">({items.length})</span>
                <span className="text-xs text-neutral-400 underline">{doneOpen ? "Masquer" : "Afficher"}</span>
              </button>
            ) : (
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBucketBadgeClass(bucket)}`}>
                  {PRIORITY_BUCKET_LABELS[bucket]}
                </span>
                <span className="text-xs text-neutral-400">({items.length})</span>
              </div>
            )}

            {(!isDone || doneOpen) && (
              <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${isDone ? "mt-3" : ""}`}>
                {items.map((entry) => (
                  <EntryCard key={`${entry.kind}-${entry.id}`} entry={entry} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EntryCard({ entry }: { entry: ScheduleEntry }) {
  return (
    <Link
      href={entry.href}
      className="block rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[entry.kind]}`}>
          {KIND_LABELS[entry.kind]}
        </span>
        {entry.estimated && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
            estimée
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-medium text-neutral-900">{entry.title}</p>
      {entry.subtitle && <p className="text-xs text-neutral-400">{entry.subtitle}</p>}
      <p className="mt-1 text-xs font-medium text-neutral-600">{entry.dueText}</p>

      <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
        {entry.clientName && (
          <p>
            {entry.clientName}
            {entry.projectName ? ` · ${entry.projectName}` : ""}
          </p>
        )}
        {entry.programName && <p className="text-neutral-400">{entry.programName}</p>}
        {entry.amount != null && <p className="font-medium text-neutral-700">{money(entry.amount)}</p>}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${entry.statusClass}`}>{entry.statusLabel}</span>
        {entry.missingCount != null && entry.missingCount > 0 && (
          <span className="text-[11px] font-medium text-red-600">
            {entry.missingCount} élément{entry.missingCount > 1 ? "s" : ""} manquant{entry.missingCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}

function money(n: number) {
  return `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
