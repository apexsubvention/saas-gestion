import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";

export default async function ClientsPage() {
  const supabase = await createClient();
  const clients = await clientsService(supabase).list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Clients</h1>
        <Link
          href="/clients/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
        >
          + Nouveau client
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nom</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Secteur</th>
              <th className="px-4 py-2 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Aucun client pour l&apos;instant.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/clients/${c.id}`} className="font-medium text-neutral-900 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">{c.status}</td>
                <td className="px-4 py-2 text-neutral-600">{c.sector ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">
                  {new Date(c.created_at).toLocaleDateString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
