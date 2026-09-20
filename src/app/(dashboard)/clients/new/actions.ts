"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";
import { requireOrgContext } from "@/lib/permissions";
import { createClientSchema } from "@/features/clients/schemas";

// Duplique volontairement le formatage d'erreur de src/app/(dashboard)/clients/[id]/actions.ts
// (voir le commentaire là-bas pour le contexte complet) : une erreur Supabase brute
// (PostgrestError/AuthError) n'est pas une instance d'Error, donc `e instanceof Error ?
// e.message : "Erreur inconnue"` masquait systématiquement la vraie cause (contrainte
// RLS, colonne manquante, etc.) derrière "Erreur inconnue" -- c'était le bug rapporté.
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

export type CreateClientFormState = { error: string | null };

export async function createClientAction(
  _prev: CreateClientFormState,
  formData: FormData
): Promise<CreateClientFormState> {
  const ctx = await requireOrgContext();

  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status") || "prospect",
    website: formData.get("website") ?? "",
    sector: formData.get("sector") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  let newClient;
  try {
    newClient = await clientsService(supabase).create(
      ctx.organizationId,
      ctx.organizationUserId,
      parsed.data
    );
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/clients");
  redirect(`/clients/${newClient.id}`);
}
