import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { UploadDocumentForm } from "./UploadDocumentForm";
import { NeedsForm } from "./NeedsForm";
import { GRANT_PROJECT_STATUS_LABELS, grantProjectStatusBadgeClass } from "@/features/grants/constants";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const client = await clientsService(supabase).get(params.id);
  if (!client) notFound();

  const [projects, documents] = await Promise.all([
    grantProjectsService(supabase).listByClient(params.id),
    documentsService(supabase).listByClient(params.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-neutral-400">{client.status}</p>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">{client.name}</h1>
        <p className="mt-1 font-mono text-xs text-neutral-400">{client.id}</p>
        {client.sector && <p className="mt-2 text-sm text-neutral-600">Secteur : {client.sector}</p>}
        {client.website && (
          <a href={client.website} target="_blank" className="text-sm text-blue-600 hover:underline">
            {client.website}
          </a>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Besoins actuels</h2>
        <p className="text-xs text-neutral-500">
          Décris ici le projet actuel du client (embauche, formation, export, équipement, technologie...).
          Apex s&apos;en sert pour repérer les subventions les plus pertinentes, sans avoir à retaper le
          texte dans « Parle-moi de ton projet ».
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <NeedsForm
            clientId={client.id}
            initialNeeds={client.current_needs ?? ""}
            needsUpdatedAt={client.needs_updated_at}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Projets de subvention</h2>
          <Link href={`/grants/new?client_id=${client.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
            + Nouveau projet
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {projects && projects.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {projects.map((p: any) => (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/grants/${p.id}`} className="font-medium text-neutral-900 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{p.grant_programs?.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${grantProjectStatusBadgeClass(p.status)}`}>
                        {GRANT_PROJECT_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Aucun projet pour ce client.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Documents</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <UploadDocumentForm clientId={client.id} />
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {documents.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{d.filename}</td>
                    <td className="px-4 py-2 text-neutral-600">{d.category}</td>
                    <td className="px-4 py-2 text-neutral-400">
                      {new Date(d.created_at).toLocaleDateString("fr-CA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-400">Aucun document.</p>
          )}
        </div>
      </section>
    </div>
  );
}
