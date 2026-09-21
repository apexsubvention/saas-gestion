// Vue globale « Mes tâches » : regroupe les tâches actives par échéance (en retard / aujourd'hui / cette
// semaine / à venir / sans date) et applique les filtres. Fonctions pures, sans accès base.

export type TaskForList = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null; // AAAA-MM-JJ
  priority: string;
  status: string;
  source: string;
  assigned_to: string | null;
  client_id: string | null;
  grant_project_id: string | null;
  grant_projects?: { name: string; client_id?: string; clients?: { name: string } | null; grant_programs?: { name: string } | null } | null;
  clients?: { name: string } | null;
};

export type TaskGroupKey = "overdue" | "today" | "this_week" | "later" | "no_date";

export const TASK_GROUP_LABELS: Record<TaskGroupKey, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  this_week: "Cette semaine",
  later: "À venir",
  no_date: "Sans date",
};
export const TASK_GROUP_ORDER: TaskGroupKey[] = ["overdue", "today", "this_week", "later", "no_date"];

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const TERMINAL = new Set(["done", "cancelled"]);

export type TaskFilters = {
  assignee: "me" | "all" | string; // « me », « all » ou l'id d'un membre
  client?: string; // id client
  project?: string; // id dossier
  program?: string; // nom de programme (texte exact)
  priority?: string;
  origin?: string; // tasks.source
};

export function groupOf(dueDate: string | null, today: string): TaskGroupKey {
  if (!dueDate) return "no_date";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  return dueDate <= end.toISOString().slice(0, 10) ? "this_week" : "later";
}

export function filterTasks(tasks: TaskForList[], f: TaskFilters, meId: string): TaskForList[] {
  return tasks.filter((t) => {
    if (TERMINAL.has(t.status)) return false;
    const who = f.assignee === "me" ? meId : f.assignee;
    if (who !== "all" && t.assigned_to !== who) return false;
    const clientId = t.client_id ?? t.grant_projects?.client_id ?? null;
    if (f.client && clientId !== f.client) return false;
    if (f.project && t.grant_project_id !== f.project) return false;
    if (f.program && t.grant_projects?.grant_programs?.name !== f.program) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.origin && t.source !== f.origin) return false;
    return true;
  });
}

export function groupTasks(tasks: TaskForList[], today: string): Record<TaskGroupKey, TaskForList[]> {
  const groups: Record<TaskGroupKey, TaskForList[]> = { overdue: [], today: [], this_week: [], later: [], no_date: [] };
  for (const t of tasks) groups[groupOf(t.due_date, today)].push(t);
  for (const key of TASK_GROUP_ORDER) {
    groups[key].sort(
      (a, b) =>
        (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        a.title.localeCompare(b.title, "fr")
    );
  }
  return groups;
}
