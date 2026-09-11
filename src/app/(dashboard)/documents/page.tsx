import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { documentsListAll } from "@/server/repositories/documents.repository";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const documents = await documentsListAll(supabase)();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Documents</h1>
      <p className="text-sm text-neutral-500">
        Vue globale (lecture seule) — le téléversement se fait depuis la fiche client.
      </p>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fichier</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Catégorie</th>
              <th className="px-4 py-2 font-medium">Ajouté le</th>
            </tr>
          </thead>
          <tbody>
            {(!documents || documents.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">Aucun document.</td></tr>
            )}
            {documents?.map((d: any) => (
              <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 text-neutral-900">{d.filename}</td>
                <td className="px-4 py-2 text-neutral-600">
                  {d.client_id ? (
                    <Link href={`/clients/${d.client_id}`} className="hover:underline">
                      {d.clients?.name ?? d.client_id}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 text-neutral-600">{d.category}</td>
                <td className="px-4 py-2 text-neutral-400">{new Date(d.created_at).toLocaleDateString("fr-CA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
