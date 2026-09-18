"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentsService } from "@/server/services/documents.service";
import { clientsService } from "@/server/services/clients.service";
import { requireOrgContext } from "@/lib/permissions";

export type UploadDocumentFormState = { error: string | null };

export type UpdateClientNeedsFormState = { error: string | null; savedAt: string | null };

export async function updateClientNeedsAction(
  clientId: string,
  _prev: UpdateClientNeedsFormState,
  formData: FormData
): Promise<UpdateClientNeedsFormState> {
  const ctx = await requireOrgContext();
  const currentNeeds = String(formData.get("current_needs") ?? "");

  const supabase = await createClient();
  try {
    await clientsService(supabase).updateNeeds(clientId, ctx.organizationUserId, {
      current_needs: currentNeeds,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement", savedAt: null };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null, savedAt: new Date().toISOString() };
}

export async function uploadDocumentAction(
  clientId: string,
  _prev: UploadDocumentFormState,
  formData: FormData
): Promise<UploadDocumentFormState> {
  const ctx = await requireOrgContext();
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "other");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  try {
    await documentsService(supabase).upload({
      organizationId: ctx.organizationId,
      clientId,
      uploadedBy: ctx.organizationUserId,
      category,
      file,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload" };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}
