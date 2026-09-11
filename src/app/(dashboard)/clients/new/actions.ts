"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";
import { requireOrgContext } from "@/lib/permissions";
import { createClientSchema } from "@/features/clients/schemas";

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
    return { error: e instanceof Error ? e.message : "Erreur inconnue" };
  }

  revalidatePath("/clients");
  redirect(`/clients/${newClient.id}`);
}
