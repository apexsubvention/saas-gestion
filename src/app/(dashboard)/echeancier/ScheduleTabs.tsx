"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScheduleEntry } from "@/features/schedule/buildScheduleRows";
import { PriorityView } from "./PriorityView";
import { KanbanBoard } from "./KanbanBoard";

type Tab = "priorities" | "kanban" | "list";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "priorities", label: "Priorités" },
  { id: "kanban", label: "Kanban" },
  { id: "list", label: "Liste" },
];

export function ScheduleTabs({ entries }: { entries: ScheduleEntry[] }) {
  const [tab, setTab] = useState<Tab>("priorities");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "priorities" && <PriorityView entries={entries} />}
      {tab === "kanban" && <KanbanBoard entries={entries} />}
      {tab === "list" && <ListView entries={entries} />}
    </div>
  );
}

// Ancienne vue chronologique simple, conservée telle quelle comme 3e onglet (utile
// pour un survol rapide sans la granularité de la vue Priorités).
const KIND_LABELS: Record<ScheduleEntry["kind"], string> = { task: "Tâche", milestone: "Échéance", claim: "Réclamation" };
const KIND_BADGE: Record<ScheduleEntry["kind"], string> = {
  task: "bg-slate-100 text-slate-700",
  milestone: "bg-indigo-50 text-indigo-700",
  claim: "bg-emerald-50 text-emerald-700",
};

function ListView({ entries }: { entries: ScheduleEntry[] }) {
  const sorted = [...entries].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 font-medium">Client / Dossier</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                Rien pour l&apos;instant.
              </td>
            </tr>
          )}
          {sorted.map((entry) => (
            <tr key={`${entry.kind}-${entry.id}`} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[entry.kind]}`}>
                  {KIND_LABELS[entry.kind]}
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-900">
                <Link href={entry.href} className="hover:underline">
                  {entry.title}
                </Link>
                {entry.estimated && (
                  <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                    estimée
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {entry.clientName ?? "—"}
                {entry.projectName && <span className="text-neutral-400"> · {entry.projectName}</span>}
              </td>
              <td className="px-4 py-2 text-neutral-600">{entry.date ?? "—"}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${entry.statusClass}`}>
                  {entry.statusLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
