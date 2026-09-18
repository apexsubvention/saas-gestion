"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { requireOrgContext } from "@/lib/permissions";

export type UpdateGrantProjectStatusFormState = { error: string | null };

export async function updateGrantProjectStatusAction(
  grantProjectId: string,
  _prev: UpdateGrantProjectStatusFormState,
  formData: FormData
): Promise<UpdateGrantProjectStatusFormState> {
  await requireOrgContext();
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  try {
    await grantProjectsService(supabase).updateStatus(grantProjectId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement" };
  }

  revalidatePath(`/grants/${grantProjectId}`);
  revalidatePath("/grants");
  return { error: null };
}
