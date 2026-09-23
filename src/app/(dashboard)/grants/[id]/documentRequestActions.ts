"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { documentRequestsService } from "@/server/services/documentRequests.service";
import { claimsService } from "@/server/services/claims.service";
import { logDossierEvent } from "@/server/services/audit";

// Demandes de documents au client (« l'admin va pouvoir demander un document, le client
// pourra le téléverser ») : côté personnel, ce fichier crée/gère les demandes elles-mêmes
// -- le téléversement du client se fait depuis le portail, voir
// src/app/(portal)/portal/(app)/actions.ts.

export type DocumentRequestFormState = { error: string | null };

export async function createDocumentRequestAction(
  grantProjectId: string,
  clientId: string,
  _prev: DocumentRequestFormState,
  formData: FormData
): Promise<DocumentRequestFormState> {
  const ctx = await requireOrgContext();
  const title = String(formData.get("title") ?? "").trim();
  const document_type = String(formData.get("document_type") ?? "").trim() || "other";
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  const claimIdRaw = formData.get("claim_id");
  const claim_id = typeof claimIdRaw === "string" && claimIdRaw.length > 0 ? claimIdRaw : null;

  if (!title) return { error: "Le titre du document demandé est requis." };

  const supabase = await createClient();
  try {
    if (claim_id) {
      const ok = (await claimsService(supabase).listByProject(grantProjectId)).some((c) => c.id === claim_id);
      if (!ok) return { error: "Réclamation introuvable dans ce dossier." };
    }
    const created = await documentRequestsService(supabase).create(ctx.organizationId, clientId, {
      grant_project_id: grantProjectId,
      claim_id,
      document_type,
      title,
      instructions,
      due_date,
    });
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      client_id: clientId,
      kind: "document_requested",
      title: `Document demandé au client : ${title}`,
      source: "manual",
      ref_type: "document_request",
      ref_id: created.id,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}

export async function updateDocumentRequestStatusAction(
  grantProjectId: string,
  requestId: string,
  _prev: DocumentRequestFormState,
  formData: FormData
): Promise<DocumentRequestFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");
  const supabase = await createClient();
  try {
    const existing = await documentRequestsService(supabase).findById(requestId);
    if (!existing || existing.grant_project_id !== grantProjectId) {
      return { error: "Demande introuvable dans ce dossier." };
    }
    await documentRequestsService(supabase).updateStatus(requestId, status);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}

export async function deleteDocumentRequestAction(grantProjectId: string, requestId: string): Promise<DocumentRequestFormState> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const existing = await documentRequestsService(supabase).findById(requestId);
    if (!existing || existing.grant_project_id !== grantProjectId) {
      return { error: "Demande introuvable dans ce dossier." };
    }
    const removed = await documentRequestsService(supabase).remove(requestId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}
