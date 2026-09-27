"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { clientNotesService } from "@/server/services/clientNotes.service";
import { formatCaughtError } from "@/lib/errors";

// Fil de notes du CLIENT (0062, Jade) -- équivalent de grants/[id]/notesActions.ts (dossier_notes),
// mais pour les petites choses discutées (rencontre ou autrement) qui n'ont pas forcément de
// rapport avec un dossier précis. Écriture directe via RLS (client_notes_insert_staff).

export type AddClientNoteFormState = { error: string | null };

export async function addClientNoteAction(
  clientId: string,
  _prev: AddClientNoteFormState,
  formData: FormData
): Promise<AddClientNoteFormState> {
  const ctx = await requireOrgContext();
  const body = String(formData.get("body") ?? "");
  const visibleToClient = formData.get("visible_to_client") === "on";

  const supabase = await createClient();
  try {
    await clientNotesService(supabase).add({
      organizationId: ctx.organizationId,
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

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function deleteClientNoteAction(noteId: string, clientId: string): Promise<{ error: string | null }> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    await clientNotesService(supabase).remove(noteId);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}
