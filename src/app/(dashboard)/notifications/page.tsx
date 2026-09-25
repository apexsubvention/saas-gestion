import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { notificationsService } from "@/server/services/notifications.service";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  task_assigned: "Tâche assignée",
  ai_review: "À vérifier",
  general: "Info",
  deadline: "Échéance",
  claim_due: "Réclamation",
  document_missing: "Document manquant",
  invoice_missing: "Facture manquante",
  email_waiting: "Courriel",
  new_prospect: "Prospect",
  budget_warning: "Budget",
  client_followup: "Suivi client",
  meeting_task: "Réunion",
  opportunity_interest: "Intérêt client",
};

export default async function NotificationsPage() {
  await requireOrgContext();
  const supabase = await createClient();
  const items = await notificationsService(supabase).listMine();
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Notifications</h1>
          <p className="mt-1 text-sm text-neutral-500">{unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu."}</p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">Tout marquer comme lu</button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-400">
          Aucune notification. Tu en recevras quand une tâche t&apos;est assignée ou qu&apos;Apex a une lecture de document à vérifier.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.read ? "" : "bg-indigo-50/40"}`}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">{TYPE_LABELS[n.type] ?? n.type}</span>
                  {new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(n.created_at))}
                </p>
                <p className={`mt-1 text-sm ${n.read ? "text-neutral-600" : "font-medium text-neutral-900"}`}>{n.message}</p>
                {n.href && n.href.startsWith("/") && !n.href.startsWith("//") && <Link href={n.href} className="text-xs text-blue-600 hover:underline">Ouvrir</Link>}
              </div>
              {!n.read && (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50">Marquer lue</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
