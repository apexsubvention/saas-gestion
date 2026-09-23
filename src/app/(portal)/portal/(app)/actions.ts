"use server";

import { revalidatePath } from "next/cache";
import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";

const BUCKET = "apex-documents";

export type PortalUploadFormState = { error: string | null };

// Téléverser un fichier pour répondre à une demande de document (document_requests --
// créée par le personnel depuis le dossier, voir grants/[id]/documentRequestActions.ts).
//
// Le rôle "client" n'a aucune permission RLS d'écriture sur documents / document_links /
// document_requests (réservé au personnel, cf. 0016) -- et la policy de stockage
// "apex_documents_write_portal" (0033) ne couvre qu'un autre chemin (program-links), pas
// {organisation}/{client}/... utilisé ici. Plutôt que d'ouvrir des policies larges pour 3
// tables (une policy UPDATE ne peut pas restreindre la RLS à UNE SEULE colonne modifiable :
// un accès RLS "portail peut modifier document_requests" laisserait techniquement
// n'importe quel champ éditable via un appel direct à l'API), cette action :
//   1. vérifie l'accès avec le client normal (RLS -- document_requests_select ->
//      can_access_client, déjà portail-compatible) : si la demande n'est pas visible à ce
//      compte, on s'arrête là ;
//   2. effectue les 3 écritures avec le client admin, strictement sur l'id déjà vérifié.
// Même principe que regeneratePortalPasswordAction / deletePortalAccountAction : le
// service_role sert une écriture précise et vérifiée, jamais une requête ouverte.
export async function uploadRequestedDocumentAction(
  requestId: string,
  _prev: PortalUploadFormState,
  formData: FormData
): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: request, error: findError } = await supabase
    .from("document_requests")
    .select("id, organization_id, client_id, grant_project_id, title")
    .eq("id", requestId)
    .maybeSingle();
  if (findError || !request) {
    return { error: "Demande introuvable ou accès refusé." };
  }

  const admin = createAdminClient();
  try {
    const path = `${request.organization_id}/${request.client_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: orgUserRow } = await admin
      .from("organization_users")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        organization_id: request.organization_id,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size: file.size || null,
        category: "other",
        client_id: request.client_id,
        grant_project_id: request.grant_project_id,
        uploaded_by: orgUserRow?.id ?? null,
        source: "client_portal",
      })
      .select()
      .single();
    if (docError) throw docError;

    const { error: linkError } = await admin
      .from("document_links")
      .insert({
        organization_id: request.organization_id,
        document_id: (doc as { id: string }).id,
        entity_type: "document_request",
        entity_id: requestId,
      });
    if (linkError) throw linkError;

    const { error: statusError } = await admin
      .from("document_requests")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", requestId);
    if (statusError) throw statusError;

    if (request.grant_project_id) {
      await logDossierEvent(admin, { organizationId: request.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
        grant_project_id: request.grant_project_id,
        client_id: request.client_id,
        kind: "document_received_portal",
        title: `Document reçu du client : ${request.title}`,
        source: "portal",
        ref_type: "document_request",
        ref_id: requestId,
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}
