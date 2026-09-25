import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { documentsService } from "@/server/services/documents.service";
import { UploadDocumentForm } from "./UploadDocumentForm";
import { NeedsForm } from "./NeedsForm";
import { CompatiblePrograms } from "./CompatiblePrograms";
import { SetParentForm } from "./SetParentForm";
import { CreatePortalAccountForm } from "./CreatePortalAccountForm";
import { PortalAccountToggle } from "./PortalAccountToggle";
import { PortalPasswordBox } from "./PortalPasswordBox";
import { DeletePortalAccountButton } from "./DeletePortalAccountButton";
import { ClientTabs } from "./ClientTabs";
import { GRANT_PROJECT_STATUS_LABELS, grantProjectStatusBadgeClass } from "@/features/grants/constants";
import { clientOpportunityInterestsService } from "@/server/services/clientOpportunityInterests.service";
import { OpportunityInterests } from "./OpportunityInterests";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const client = await clientsService(supabase).get(params.id);
  if (!client) notFound();

  const [projects, documents, children, allClients, opportunityInterests] = await Promise.all([
    grantProjectsService(supabase).listByClient(params.id),
    documentsService(supabase).listByClient(params.id),
    clientsService(supabase).listChildren(params.id),
    clientsService(supabase).list(),
    clientOpportunityInterestsService(supabase).listByClient(params.id),
  ]);
  const parentCandidates = allClients.filter((c) => c.id !== client.id);
  const currentParent = client.parent_client_id ? allClients.find((c) => c.id === client.parent_client_id) : null;

  const { data: portalAccount } = await supabase
    .from("client_portal_users")
    .select("id, active, user_id, current_password")
    .eq("client_id", client.id)
    .maybeSingle();

  let portalAccountEmail: string | null = null;
  if (portalAccount) {
    const { data: ou } = await supabase
      .from("organization_users")
      .select("email")
      .eq("user_id", portalAccount.user_id)
      .eq("organization_id", client.organization_id)
      .maybeSingle();
    portalAccountEmail = ou?.email ?? null;
  }

  const overview = (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Hiérarchie</h2>
        <p className="text-xs text-neutral-500">
          Pour un client qui gère lui-même des clients finaux (ex. une agence comme Sitegrow) : le rattacher
          comme parent donne automatiquement accès à ses dossiers enfants depuis son portail, s&apos;il en a un.
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-600">Client parent :</span>
            <SetParentForm clientId={client.id} currentParentId={client.parent_client_id} candidates={parentCandidates} />
            {currentParent && (
              <Link href={`/clients/${currentParent.id}`} className="text-sm text-blue-600 hover:underline">
                Voir {currentParent.name}
              </Link>
            )}
          </div>
        </div>
        {children.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500">
              Clients enfants ({children.length})
            </div>
            <table className="w-full text-sm">
              <tbody>
                {children.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/clients/${c.id}`} className="font-medium text-neutral-900 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Portail client</h2>
        <p className="text-xs text-neutral-500">
          Donne à ce client (ou à un contact chez lui) un accès en ligne, avec son propre identifiant, à ses
          dossiers, échéances et informations de facturation à fournir — voir aussi les sections Fournisseurs
          des dossiers concernés.
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          {portalAccount ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-900">
                  {portalAccountEmail ?? "Compte portail"}{" "}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                      portalAccount.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {portalAccount.active ? "Actif" : "Désactivé"}
                  </span>
                </p>
                <PortalAccountToggle clientId={client.id} portalUserRowId={portalAccount.id} active={portalAccount.active} />
              </div>
              <PortalPasswordBox clientId={client.id} portalUserRowId={portalAccount.id} initialPassword={portalAccount.current_password} />
              <div className="border-t border-neutral-100 pt-3">
                <DeletePortalAccountButton clientId={client.id} portalUserRowId={portalAccount.id} email={portalAccountEmail} />
              </div>
            </div>
          ) : (
            <CreatePortalAccountForm clientId={client.id} />
          )}
        </div>
      </section>

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
        <h2 className="text-sm font-semibold text-neutral-900">Programmes compatibles</h2>
        <p className="text-xs text-neutral-500">
          Programmes enregistrés dans Apex dont la nature correspond aux besoins actuels de ce client.
        </p>
        <CompatiblePrograms supabase={supabase} needs={client.current_needs} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Opportunités signalées par le client</h2>
        <p className="text-xs text-neutral-500">
          Envoyées depuis l&apos;onglet Veille du portail client (« Cette opportunité m&apos;intéresse »).
        </p>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <OpportunityInterests clientId={client.id} interests={opportunityInterests} />
        </div>
      </section>
    </>
  );

  const dossiers = (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Dossiers</h2>
          <Link href={`/grants/new?client_id=${client.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
            + Nouveau dossier
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
    </>
  );

  const documentsTab = (
    <>
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
    </>
  );

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

      <ClientTabs overview={overview} dossiers={dossiers} documents={documentsTab} />
    </div>
  );
}
