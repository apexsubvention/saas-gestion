"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { requireOrgContext } from "@/lib/permissions";
import { createGrantProjectSchema } from "@/features/grants/schemas";

export type CreateGrantFormState = { error: string | null };

export async function createGrantProjectAction(
  _prev: CreateGrantFormState,
  formData: FormData
): Promise<CreateGrantFormState> {
  const ctx = await requireOrgContext();

  const parsed = createGrantProjectSchema.safeParse({
    client_id: formData.get("client_id"),
    program_id: formData.get("program_id"),
    name: formData.get("name"),
    total_project_cost: formData.get("total_project_cost") || undefined,
    approved_grant_amount: formData.get("approved_grant_amount") || undefined,
    official_start_date: formData.get("official_start_date") ?? "",
    official_end_date: formData.get("official_end_date") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  let project;
  try {
    project = await grantProjectsService(supabase).create(
      ctx.organizationId,
      ctx.organizationUserId,
      parsed.data
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inconnue" };
  }

  redirect(`/grants/${project.id}`);
}
