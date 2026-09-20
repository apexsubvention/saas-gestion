"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { ScheduleEntry } from "@/features/schedule/buildScheduleRows";
import type { PriorityBucket } from "@/features/schedule/priority";
import { PRIORITY_BUCKET_LABELS, priorityBucketBadgeClass } from "@/features/grants/constants";
import { markScheduleEntryDoneAction, rescheduleScheduleEntryAction } from "./actions";

// "no_date" n'a pas sa propre colonne (voir le plan : regroupé visuellement dans "Plus
// tard" pour ne pas ajouter une 7e colonne à un tableau déjà large) -- la vue Priorités
// reste la référence complète avec les 7 seaux.
const KANBAN_COLUMNS: PriorityBucket[] = ["overdue", "this_week", "next_2_weeks", "this_month", "later", "done"];

const KIND_LABELS: Record<ScheduleEntry["kind"], string> = { task: "Tâche", milestone: "Échéance", claim: "Réclamation" };

type DisplayBucket = Exclude<PriorityBucket, "no_date">;

function displayBucket(entry: ScheduleEntry): DisplayBucket {
  return entry.bucket === "no_date" ? "later" : entry.bucket;
}

export function KanbanBoard({ entries }: { entries: ScheduleEntry[] }) {
  const [localEntries, setLocalEntries] = useState(entries);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = new Map<DisplayBucket, ScheduleEntry[]>();
  for (const bucket of KANBAN_COLUMNS) columns.set(bucket, []);
  for (const entry of localEntries) columns.get(displayBucket(entry))?.push(entry);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const targetBucket = over.id as DisplayBucket;
    const [kind, id] = String(active.id).split(":") as [ScheduleEntry["kind"], string];
    const entry = localEntries.find((e) => e.kind === kind && e.id === id);
    if (!entry || displayBucket(entry) === targetBucket) return;

    const wasTerminal = entry.bucket === "done";

    // Optimiste : on déplace la carte tout de suite dans l'UI, la mise à jour serveur
    // suit derrière ; router.refresh() ensuite pour resynchroniser avec les données
    // réelles (recalcule aussi les seaux, qui dépendent de la date du jour).
    setLocalEntries((prev) => prev.map((e) => (e.kind === kind && e.id === id ? { ...e, bucket: targetBucket } : e)));

    startTransition(async () => {
      try {
        if (targetBucket === "done") {
          await markScheduleEntryDoneAction(kind, id);
        } else {
          await rescheduleScheduleEntryAction(kind, id, targetBucket, wasTerminal);
        }
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((bucket) => (
            <KanbanColumn key={bucket} bucket={bucket} items={columns.get(bucket) ?? []} />
          ))}
        </div>
      </DndContext>
      <p className="mt-3 text-xs text-neutral-400">
        Glisse une carte vers « Terminé » pour la marquer complétée, ou vers une autre colonne pour la reprogrammer
        (date approximative dans la période choisie — ajuste-la ensuite depuis le dossier si besoin).
      </p>
    </div>
  );
}

function KanbanColumn({ bucket, items }: { bucket: DisplayBucket; items: ScheduleEntry[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border p-3 transition ${
        isOver ? "border-indigo-300 bg-indigo-50/40" : "border-neutral-200 bg-neutral-50"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBucketBadgeClass(bucket)}`}>
          {PRIORITY_BUCKET_LABELS[bucket]}
        </span>
        <span className="text-xs text-neutral-400">({items.length})</span>
      </div>
      <div className="flex-1 space-y-2">
        {items.map((entry) => (
          <KanbanCard key={`${entry.kind}-${entry.id}`} entry={entry} />
        ))}
        {items.length === 0 && (
          <p className="rounded border border-dashed border-neutral-200 p-3 text-center text-xs text-neutral-300">Vide</p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ entry }: { entry: ScheduleEntry }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${entry.kind}:${entry.id}`,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab touch-none rounded-md border border-neutral-200 bg-white p-3 text-xs shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-neutral-400">{KIND_LABELS[entry.kind]}</span>
        {entry.amount != null && <span className="font-medium text-neutral-700">{money(entry.amount)}</span>}
      </div>
      <Link href={entry.href} className="mt-1 block font-medium text-neutral-900 hover:underline">
        {entry.title}
      </Link>
      {entry.clientName && (
        <p className="mt-1 text-neutral-500">
          {entry.clientName}
          {entry.projectName ? ` · ${entry.projectName}` : ""}
        </p>
      )}
      <p className="mt-1 text-neutral-400">{entry.dueText}</p>
      {entry.missingCount != null && entry.missingCount > 0 && (
        <p className="mt-1 font-medium text-red-600">
          {entry.missingCount} manquant{entry.missingCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function money(n: number) {
  return `${n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
