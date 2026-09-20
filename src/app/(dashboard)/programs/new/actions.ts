"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { programsService } from "@/server/services/programs.service";
import { requireOrgContext } from "@/lib/permissions";
import { createProgramSchema } from "@/features/programs/schemas";
import { formatCaughtError } from "@/lib/errors";
import { parsePublicUrl } from "@/features/programs/reader/safeFetch";
import { readProgramFromUrl } from "@/features/programs/reader/readProgram";
import type { ProgramReadResult } from "@/features/programs/reader/types";

export type CreateProgramFormState = { error: string | null };

export async function createProgramAction(
  _prev: CreateProgramFormState,
  formData: FormData
): Promise<CreateProgramFormState> {
  const ctx = await requireOrgContext();

  const parsed = createProgramSchema.safeParse({
    name: formData.get("name") ?? "",
    agency: formData.get("agency") ?? "",
    description: formData.get("description") ?? "",
    program_type: formData.get("program_type") ?? "",
    territory: formData.get("territory") ?? "",
    source_url: formData.get("source_url") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const sourceUrl = parsed.data.source_url;
  if (!parsed.data.name && !sourceUrl) {
    return { error: "Indique un nom, ou l'URL de la page du programme pour que le nom soit repris de la page." };
  }

  // La lecture ne bloque jamais la création : en cas d'échec le programme est créé quand même
  // (avec le motif de l'échec) et la lecture pourra être relancée depuis sa fiche.
  let read: ProgramReadResult | undefined;
  if (sourceUrl) {
    try {
      parsePublicUrl(sourceUrl);
    } catch (e) {
      return { error: formatCaughtError(e) };
    }
    read = await readProgramFromUrl(sourceUrl);
    if (!parsed.data.name && !read.fields.name) {
      return { error: `Nom requis : la page n'a pas pu être lue${read.error ? ` (${read.error})` : ""}. Saisis le nom à la main.` };
    }
  }

  const supabase = await createClient();
  let programId: string;
  try {
    const program = await programsService(supabase).create(ctx.organizationId, parsed.data, read);
    programId = program.id;
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/programs");
  redirect(`/programs/${programId}`);
}
