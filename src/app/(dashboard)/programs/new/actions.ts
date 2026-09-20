"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { programsService } from "@/server/services/programs.service";
import { requireOrgContext } from "@/lib/permissions";
import { createProgramSchema } from "@/features/programs/schemas";

// Duplique volontairement le formatage d'erreur de src/app/(dashboard)/clients/[id]/actions.ts
// (voir le commentaire là-bas pour le contexte complet) : une erreur Supabase brute
// (PostgrestError/AuthError) n'est pas une instance d'Error, donc `e instanceof Error ?
// e.message : "Erreur inconnue"` masquait la vraie cause derrière "Erreur inconnue".
function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code].filter(
      (v) => typeof v === "string" && v.length > 0
    );
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erreur non sérialisable.";
    }
  }
  return String(e);
}

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
    return { error: formatCaughtError(e) };
  }

  redirect("/programs");
}
