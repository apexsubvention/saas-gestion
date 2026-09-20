import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { claimsListAll } from "@/server/repositories/claims.repository";
import { CLAIM_STATUS_LABELS, claimStatusBadgeClass } from "@/features/grants/constants";

export default async function ReclamationsPage() {
  const supabase = await createClient();
  const claims = await claimsListAll(supabase)();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Réclamations</h1>
      <p className="text-sm text-neutral-500">
        Vue globale (lecture seule) — la création et le changement de statut se font depuis la fiche du dossier
        de subvention.
      </p>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Réclamation</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Dossier</th>
              <th className="px-4 py-2 font-medium">Échéance</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {(!claims || claims.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Aucune réclamation.
                </td>
              </tr>
            )}
            {claims?.map((c: any) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 text-neutral-900">{c.claim_number || "—"}</td>
                <td className="px-4 py-2 text-neutral-600">
                  {c.grant_projects?.client_id ? (
                    <Link href={`/clients/${c.grant_projects.client_id}`} className="hover:underline">
                      {c.grant_projects?.clients?.name ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  <Link href={`/grants/${c.grant_project_id}`} className="hover:underline">
                    {c.grant_projects?.name ?? c.grant_project_id}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-400">{c.due_date ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${claimStatusBadgeClass(c.status)}`}>
                    {CLAIM_STATUS_LABELS[c.status] ?? c.status}
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
