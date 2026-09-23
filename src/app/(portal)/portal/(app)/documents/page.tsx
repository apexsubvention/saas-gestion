import { createClient } from "@/lib/supabase/server";
import { portalDocumentsService } from "@/server/services/portalDocuments.service";
import { DocumentsLibrary } from "../DocumentsLibrary";

// Bibliothèque de documents du portail (0045) : tous les documents des dossiers
// accessibles au compte (le sien + ses clients enfants -- hiérarchie, cf. 0028), déposés
// par le personnel OU par le client, groupés par dossier. Voir portalDocuments.service.ts
// pour la RLS (documents_select_portal_full).
export default async function PortalDocumentsPage() {
  const supabase = await createClient();
  const groups = await portalDocumentsService(supabase).listGrouped();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Documents</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tous les documents de tes dossiers, déposés par ton équipe chez Apex ou par toi-même.
        </p>
      </div>
      <DocumentsLibrary groups={groups} />
    </div>
  );
}
