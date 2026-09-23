"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { dossierNotesService } from "@/server/services/dossierNotes.service";
import { formatCaughtError } from "@/lib/errors";

// Fil de notes du dossier (0046) -- écriture directe via RLS (dossier_notes_insert_staff),
// pas de client admin nécessaire : la table a été conçue pour ça dès le départ, contrairement
// à documents/document_requests (voir portal/(app)/actions.ts pour le contraste).

export type AddDossierNoteFormState = { error: string | null };

export async function addDossierNoteAction(
  grantProjectId: string,
  clientId: string,
  _prev: AddDossierNoteFormState,
  formData: FormData
): Promise<AddDossierNoteFormState> {
  const ctx = await requireOrgContext();
  const body = String(formData.get("body") ?? "");
  const visibleToClient = formData.get("visible_to_client") === "on";

  const supabase = await createClient();
  try {
    await dossierNotesService(supabase).add({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientId,
      authorOrgUserId: ctx.organizationUserId,
      authorRole: "staff",
      authorName: ctx.fullName || "Membre de l'équipe",
      body,
      visibleToClient,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}

export async function deleteDossierNoteAction(noteId: string, grantProjectId: string): Promise<{ error: string | null }> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    await dossierNotesService(supabase).remove(noteId);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}
