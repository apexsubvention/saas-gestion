"use server";

import { revalidatePath } from "next/cache";
import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";

const BUCKET = "apex-documents";

export type PortalUploadDocumentFormState = { error: string | null };

// Dépôt libre d'un document depuis le portail (0046) -- par opposition à
// uploadRequestedDocumentAction (actions.ts), qui répond à une demande précise du
// personnel : ici, le client dépose un document de sa propre initiative (ex. une facture
// qu'il vient de recevoir), sans qu'une document_request existe. Même principe de
// sécurité que le reste du portail : le rôle "client" n'a pas de RLS d'écriture sur
// "documents" (réservé au personnel, cf. 0016) -- on vérifie donc l'accès au dossier
// choisi avec le client normal (RLS -- grant_projects_select -> can_access_client, déjà
// portail-compatible), puis on écrit avec le client admin sur l'id déjà vérifié.
export async function uploadSharedDocumentAction(
  _prev: PortalUploadDocumentFormState,
  formData: FormData
): Promise<PortalUploadDocumentFormState> {
  const ctx = await requirePortalContext();
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "other");
  const grantProjectIdRaw = formData.get("grant_project_id");
  const grantProjectId = typeof grantProjectIdRaw === "string" && grantProjectIdRaw.length > 0 ? grantProjectIdRaw : null;

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  let clientId = ctx.clientId;
  if (grantProjectId) {
    const { data: project, error: findError } = await supabase
      .from("grant_projects")
      .select("id, client_id")
      .eq("id", grantProjectId)
      .maybeSingle();
    if (findError || !project) {
      return { error: "Dossier introuvable ou accès refusé." };
    }
    clientId = project.client_id;
  }

  const admin = createAdminClient();
  try {
    const path = `${ctx.organizationId}/${clientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        organization_id: ctx.organizationId,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size: file.size || null,
        category,
        client_id: clientId,
        grant_project_id: grantProjectId,
        uploaded_by: ctx.organizationUserId,
        source: "client_portal",
      })
      .select()
      .single();
    if (docError) throw docError;

    if (grantProjectId && ctx.organizationUserId) {
      await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId }, {
        grant_project_id: grantProjectId,
        client_id: clientId,
        kind: "document_received_portal",
        title: `Document déposé par le client : ${file.name}`,
        source: "portal",
        ref_type: "document",
        ref_id: (doc as { id: string }).id,
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal/documents");
  return { error: null };
}
