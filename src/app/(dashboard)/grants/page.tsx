import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { GRANT_PROJECT_STATUS_LABELS, grantProjectStatusBadgeClass } from "@/features/grants/constants";
import { DeleteGrantProjectButton } from "./DeleteGrantProjectButton";

export default async function GrantsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const projects = await grantProjectsService(supabase).list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Projets de subvention</h1>
        <Link href="/grants/new" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
          + Nouveau projet
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Projet</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Programme</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Montant approuvé</th>
              {ctx.role === "admin" && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {(!projects || projects.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400">Aucun projet pour l&apos;instant.</td></tr>
            )}
            {projects?.map((p: any) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/grants/${p.id}`} className="font-medium text-neutral-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">{p.clients?.name ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{p.grant_programs?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${grantProjectStatusBadgeClass(p.status)}`}>
                    {GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  {p.approved_grant_amount ? `${Number(p.approved_grant_amount).toLocaleString("fr-CA")} $` : "—"}
                </td>
                {ctx.role === "admin" && (
                  <td className="px-4 py-2 text-right">
                    <DeleteGrantProjectButton grantProjectId={p.id} name={p.name} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
