"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { programsService } from "@/server/services/programs.service";
import { requireOrgContext } from "@/lib/permissions";
import { createProgramSchema } from "@/features/programs/schemas";

export type CreateProgramFormState = { error: string | null };

export async function createProgramAction(
  _prev: CreateProgramFormState,
  formData: FormData
): Promise<CreateProgramFormState> {
  const ctx = await requireOrgContext();

  const parsed = createProgramSchema.safeParse({
    name: formData.get("name"),
    agency: formData.get("agency") ?? "",
    description: formData.get("description") ?? "",
    program_type: formData.get("program_type") ?? "",
    territory: formData.get("territory") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  try {
    await programsService(supabase).create(ctx.organizationId, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inconnue" };
  }

  redirect("/programs");
}
