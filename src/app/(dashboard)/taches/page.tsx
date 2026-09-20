import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, taskStatusBadgeClass } from "@/features/grants/constants";

export default async function TachesPage() {
  const supabase = await createClient();
  const tasks = await tasksListAll(supabase)();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Tâches</h1>
      <p className="text-sm text-neutral-500">
        Vue globale (lecture seule) des tâches actives — terminées et annulées masquées. La création et le
        changement de statut se font depuis la fiche du dossier concerné.
      </p>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Tâche</th>
              <th className="px-4 py-2 font-medium">Client / Dossier</th>
              <th className="px-4 py-2 font-medium">Priorité</th>
              <th className="px-4 py-2 font-medium">Échéance</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {(!tasks || tasks.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Aucune tâche active.
                </td>
              </tr>
            )}
            {tasks?.map((t: any) => (
              <tr key={t.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 text-neutral-900">{t.title}</td>
                <td className="px-4 py-2 text-neutral-600">
                  {t.grant_project_id ? (
                    <Link href={`/grants/${t.grant_project_id}`} className="hover:underline">
                      {t.grant_projects?.name ?? t.grant_project_id}
                    </Link>
                  ) : t.client_id ? (
                    <Link href={`/clients/${t.client_id}`} className="hover:underline">
                      {t.clients?.name ?? t.client_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-600">{TASK_PRIORITY_LABELS[t.priority] ?? t.priority}</td>
                <td className="px-4 py-2 text-neutral-400">{t.due_date ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusBadgeClass(t.status)}`}>
                    {TASK_STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
