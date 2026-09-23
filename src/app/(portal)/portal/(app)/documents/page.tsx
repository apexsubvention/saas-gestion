import { createClient } from "@/lib/supabase/server";
import { portalDocumentsService } from "@/server/services/portalDocuments.service";
import { DocumentsLibrary } from "../DocumentsLibrary";
import { PortalUploadDocumentForm } from "./PortalUploadDocumentForm";

// Bibliothèque de documents du portail (0045) : tous les documents des dossiers
// accessibles au compte (le sien + ses clients enfants -- hiérarchie, cf. 0028), déposés
// par le personnel OU par le client, groupés par dossier. Voir portalDocuments.service.ts
// pour la RLS (documents_select_portal_full).
//
// Dépôt libre (0046) : la liste de dossiers pour le sélecteur vient d'une requête
// directe (pas de portalDossiersService, trop coûteux ici) -- grant_projects_select est
// déjà portail-compatible (can_access_client), donc aucun dossier accessible n'est omis,
// même ceux qui n'ont encore aucun document (absents de "groups" ci-dessus).
export default async function PortalDocumentsPage() {
  const supabase = await createClient();
  const [groups, { data: projectRows }] = await Promise.all([
    portalDocumentsService(supabase).listGrouped(),
    supabase.from("grant_projects").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Documents</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tous les documents de tes dossiers, déposés par ton équipe chez Apex ou par toi-même.
        </p>
      </div>
      <PortalUploadDocumentForm dossiers={projectRows ?? []} />
      <DocumentsLibrary groups={groups} />
    </div>
  );
}
