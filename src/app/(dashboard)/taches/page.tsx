import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { filterTasks, groupTasks, TASK_GROUP_LABELS, TASK_GROUP_ORDER, type TaskForList } from "@/features/tasks/myTasks";
import { TASK_PRIORITY_LABELS } from "@/features/grants/constants";
import { completeTaskAction } from "../grants/[id]/taskActions";

type SearchParams = { who?: string; client?: string; program?: string; priority?: string; origin?: string; project?: string };

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manuelle", email: "Courriel", meeting: "Réunion", claim: "Réclamation", agreement: "Extraite d'une entente", ai: "Générée par Apex", document: "Demande de document client",
};
const GROUP_STYLE: Record<string, string> = {
  overdue: "bg-red-50 text-red-700", today: "bg-orange-50 text-orange-800", this_week: "bg-amber-50 text-amber-800", later: "bg-blue-50 text-blue-700", no_date: "bg-neutral-100 text-neutral-500",
};

const select = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm";

// « Qu'est-ce que je dois faire aujourd'hui ? » : mes tâches actives, regroupées par échéance, avec filtres.
export default async function MyTasksPage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();

  const [rows, staffRes] = await Promise.all([
    tasksListAll(supabase)(),
    supabase.from("organization_users").select("id, full_name, email").eq("active", true).in("role", ["admin", "employee"]),
  ]);
  const staff = (staffRes.data ?? []).map((u) => ({ id: u.id, name: u.full_name || u.email || "Membre de l'équipe" }));
  const tasks = rows as unknown as TaskForList[];

  const who = searchParams?.who || "me";
  const filters = { assignee: who, client: searchParams?.client || undefined, program: searchParams?.program || undefined, priority: searchParams?.priority || undefined, origin: searchParams?.origin || undefined, project: searchParams?.project || undefined };
  const today = new Date().toISOString().slice(0, 10);
  const groups = groupTasks(filterTasks(tasks, filters, ctx.organizationUserId), today);
  const total = TASK_GROUP_ORDER.reduce((n, k) => n + groups[k].length, 0);

  // Valeurs proposées dans les filtres : celles présentes dans les tâches actives.
  const clients = new Map<string, string>();
  const programs = new Set<string>();
  const origins = new Set<string>();
  for (const t of tasks) {
    const cid = t.client_id ?? t.grant_projects?.client_id;
    const cname = t.clients?.name ?? t.grant_projects?.clients?.name;
    if (cid && cname) clients.set(cid, cname);
    if (t.grant_projects?.grant_programs?.name) programs.add(t.grant_projects.grant_programs.name);
    origins.add(t.source);
  }
  const assigneeName = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "Non assignée";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Mes tâches</h1>
        <p className="mt-1 text-sm text-neutral-500">Tes tâches actives de tous les dossiers, de la plus urgente à la plus lointaine. Les tâches terminées n&apos;apparaissent plus ici.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
        <label className="space-y-1 text-xs text-neutral-500">Responsable
          <select name="who" defaultValue={who} className={`${select} block`}>
            <option value="me">Moi</option>
            <option value="all">Toute l&apos;équipe</option>
            {staff.filter((s) => s.id !== ctx.organizationUserId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-neutral-500">Client
          <select name="client" defaultValue={filters.client ?? ""} className={`${select} block`}>
            <option value="">Tous</option>
            {[...clients.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-neutral-500">Programme
          <select name="program" defaultValue={filters.program ?? ""} className={`${select} block`}>
            <option value="">Tous</option>
            {[...programs].sort((a, b) => a.localeCompare(b, "fr")).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-neutral-500">Priorité
          <select name="priority" defaultValue={filters.priority ?? ""} className={`${select} block`}>
            <option value="">Toutes</option>
            {Object.entries(TASK_PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-neutral-500">Origine
          <select name="origin" defaultValue={filters.origin ?? ""} className={`${select} block`}>
            <option value="">Toutes</option>
            {[...origins].map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o] ?? o}</option>)}
          </select>
        </label>
        <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Filtrer</button>
        <Link href="/taches" className="px-2 py-2 text-sm text-neutral-500 underline">Réinitialiser</Link>
      </form>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-400">
          {who === "me" ? "Aucune tâche active pour toi avec ces filtres. 🎉" : "Aucune tâche active avec ces filtres."}
        </p>
      ) : (
        TASK_GROUP_ORDER.filter((k) => groups[k].length > 0).map((k) => (
          <section key={k} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${GROUP_STYLE[k]}`}>{TASK_GROUP_LABELS[k]}</span>
              <span className="text-xs text-neutral-400">({groups[k].length})</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups[k].map((t) => {
                const clientName = t.clients?.name ?? t.grant_projects?.clients?.name;
                const href = t.grant_project_id ? `/grants/${t.grant_project_id}` : t.client_id ? `/clients/${t.client_id}` : "#";
                return (
                  <li key={t.id} className="flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-4">
                    <div>
                      <Link href={href} className="text-sm font-medium text-neutral-900 hover:underline">{t.title}</Link>
                      <p className="mt-1 text-xs text-neutral-500">{t.due_date ? `Échéance ${t.due_date}` : "Sans échéance"} · {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}</p>
                      {clientName && <p className="mt-1 text-xs text-neutral-500">{clientName}{t.grant_projects?.name ? ` · ${t.grant_projects.name}` : ""}</p>}
                      {t.grant_projects?.grant_programs?.name && <p className="text-xs text-neutral-400">{t.grant_projects.grant_programs.name}</p>}
                      <p className="mt-1 text-[11px] text-neutral-400">Origine : {ORIGIN_LABELS[t.source] ?? t.source}{who !== "me" ? ` · ${assigneeName(t.assigned_to)}` : ""}</p>
                    </div>
                    <form action={completeTaskAction} className="mt-3">
                      <input type="hidden" name="id" value={t.id} />
                      <button className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Marquer terminé</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
