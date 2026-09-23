"use server";

import { revalidatePath } from "next/cache";
import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { dossierNotesService } from "@/server/services/dossierNotes.service";
import { formatCaughtError } from "@/lib/errors";

// Fil de notes partagées (0046) -- écriture directe via RLS (dossier_notes_insert_portal),
// contrairement au reste des écritures du portail (documents/document_requests, voir
// actions.ts) : cette table a été conçue dès le départ pour accepter l'écriture des deux
// côtés en toute sécurité (chacun n'écrit que sa propre ligne).

export type AddPortalNoteFormState = { error: string | null };

export async function addPortalNoteAction(
  grantProjectId: string,
  clientId: string,
  _prev: AddPortalNoteFormState,
  formData: FormData
): Promise<AddPortalNoteFormState> {
  const ctx = await requirePortalContext();
  if (!ctx.organizationUserId) {
    return { error: "Compte portail incomplet -- contacte ton équipe chez Apex." };
  }
  const body = String(formData.get("body") ?? "");

  const supabase = await createClient();
  try {
    await dossierNotesService(supabase).add({
      organizationId: ctx.organizationId,
      grantProjectId,
      clientId,
      authorOrgUserId: ctx.organizationUserId,
      authorRole: "client",
      authorName: ctx.fullName || ctx.clientName || "Le client",
      body,
      visibleToClient: true,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}

export async function deletePortalNoteAction(noteId: string): Promise<{ error: string | null }> {
  await requirePortalContext();
  const supabase = await createClient();
  try {
    await dossierNotesService(supabase).remove(noteId);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath("/portal");
  return { error: null };
}
