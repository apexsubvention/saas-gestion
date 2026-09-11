"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { documentsService } from "@/server/services/documents.service";
import { requireOrgContext } from "@/lib/permissions";

export type UploadDocumentFormState = { error: string | null };

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
