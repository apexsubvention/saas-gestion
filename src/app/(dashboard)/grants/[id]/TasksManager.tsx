"use client";

import { useState, useTransition } from "react";
import { deleteTaskAction, updateTaskDetailsAction } from "./taskActions";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, taskStatusBadgeClass } from "@/features/grants/constants";
import type { TaskRow } from "@/server/repositories/tasks.repository";

type Assignee = { id: string; name: string };

const input = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const btn = "rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

// Statuts proposés : À faire / En cours / En attente / Terminé. Un ancien statut (bloquée, attente
// fournisseur...) reste affiché et sélectionnable tant que la tâche l'utilise : rien n'est converti.
const MAIN_STATUSES: Array<[string, string]> = [["todo", "À faire"], ["in_progress", "En cours"], ["waiting_client", "En attente"], ["done", "Terminé"]];

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manuelle", email: "Courriel", meeting: "Réunion", claim: "Réclamation", agreement: "Extraite d'une entente", ai: "Générée par Apex", document: "Demande de document client",
};

function TaskItem({ grantProjectId, task, assignees }: { grantProjectId: string; task: TaskRow; assignees: Assignee[] }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [assignee, setAssignee] = useState(task.assigned_to ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const statusOptions = MAIN_STATUSES.some(([v]) => v === task.status) ? MAIN_STATUSES : [...MAIN_STATUSES, [task.status, TASK_STATUS_LABELS[task.status] ?? task.status] as [string, string]];
  const assigneeName = assignees.find((a) => a.id === task.assigned_to)?.name ?? "Non assignée";

  function save(overrides: Partial<{ status: string }> = {}) {
    setError(null);
    startTransition(async () => {
      const r = await updateTaskDetailsAction(grantProjectId, {
        id: task.id, title, description: description || null, due_date: due || null, priority: priority as "low" | "normal" | "high" | "urgent", status: overrides.status ?? status, assigned_to: assignee || null,
      });
      if (r.error) setError(r.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`Supprimer la tâche « ${task.title} » ? Cette action est définitive.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTaskAction(grantProjectId, task.id);
      if (r.error) setError(r.error);
    });
  }

  return (
    <li className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${task.status === "done" ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${taskStatusBadgeClass(task.status)}`}>{TASK_STATUS_LABELS[task.status] ?? task.status}</span>
            <span>{task.due_date ? `Échéance ${task.due_date}` : "Sans échéance"}</span>
            <span>Priorité {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}</span>
            <span>{assigneeName}</span>
            <span className="text-neutral-400">Origine : {ORIGIN_LABELS[task.source] ?? task.source}</span>
          </p>
          {task.description && !editing && <p className="mt-1 text-xs text-neutral-600">{task.description}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {task.status !== "done" && <button className={btn} disabled={pending} onClick={() => save({ status: "done" })}>Marquer terminé</button>}
          <button className={btn} onClick={() => setEditing((v) => !v)}>{editing ? "Fermer" : "Modifier"}</button>
          <button className={`${btn} text-red-700`} disabled={pending} onClick={remove}>Supprimer</button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-neutral-600 sm:col-span-2">Titre<input value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></label>
          <label className="space-y-1 text-xs text-neutral-600 sm:col-span-2">Description<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></label>
          <label className="space-y-1 text-xs text-neutral-600">Échéance<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} /></label>
          <label className="space-y-1 text-xs text-neutral-600">Priorité
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={input}>
              {Object.entries(TASK_PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-neutral-600">Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
              {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-neutral-600">Responsable (réassigner)
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
              <option value="">Non assignée</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => save()}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

// Toutes les tâches du dossier (manuelles ET automatiques) : modifier, réassigner, terminer, supprimer.
// Une tâche automatique reste modifiable sans perdre son origine.
export function TasksManager({ grantProjectId, tasks, assignees }: { grantProjectId: string; tasks: TaskRow[]; assignees: Assignee[] }) {
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const closed = tasks.filter((t) => t.status === "done" || t.status === "cancelled");
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900">Tâches du dossier ({open.length} en cours)</h3>
      <ul className="space-y-2">{open.map((t) => <TaskItem key={`${t.id}-${t.status}-${t.assigned_to}`} grantProjectId={grantProjectId} task={t} assignees={assignees} />)}</ul>
      {open.length === 0 && <p className="text-sm text-neutral-400">Aucune tâche en cours.</p>}
      {closed.length > 0 && (
        <>
          <button onClick={() => setShowDone((v) => !v)} className="text-xs text-neutral-500 underline">{showDone ? "Masquer" : "Afficher"} les tâches terminées ou annulées ({closed.length}) — conservées pour l&apos;historique</button>
          {showDone && <ul className="space-y-2">{closed.map((t) => <TaskItem key={`${t.id}-${t.status}`} grantProjectId={grantProjectId} task={t} assignees={assignees} />)}</ul>}
        </>
      )}
    </div>
  );
}
