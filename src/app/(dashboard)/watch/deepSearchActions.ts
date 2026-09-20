"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { programsService } from "@/server/services/programs.service";
import { projectWebSearchService } from "@/server/services/projectWebSearch.service";
import { parsePublicUrl } from "@/features/programs/reader/safeFetch";
import { readProgramFromUrl } from "@/features/programs/reader/readProgram";
import type { DeepSearchActionResult } from "@/features/watch/webSearch/types";

// Recherche web approfondie pour « Parle-moi de ton projet » (voir features/watch/webSearch).
export async function runDeepSearchAction(project: string, force = false): Promise<DeepSearchActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const { result, cached } = await projectWebSearchService(supabase).run(ctx, String(project ?? ""), force === true);
    return { ok: true, result, cached };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

export type AddWebProgramState = { error: string | null };

// Transforme un résultat de la recherche web en programme : la page est lue automatiquement
// (mêmes règles que « Nouveau programme »), puis la fiche s'ouvre.
export async function addWebResultAsProgramAction(_prev: AddWebProgramState, formData: FormData): Promise<AddWebProgramState> {
  const ctx = await requireOrgContext();
  const url = String(formData.get("url") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const agency = String(formData.get("organization") ?? "").trim().slice(0, 200);
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 5000);
  if (!name) return { error: "Nom du programme manquant." };

  try {
    parsePublicUrl(url);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  const supabase = await createClient();
  const service = programsService(supabase);
  let programId: string;
  try {
    const existing = await service.findBySourceUrl(url);
    if (existing) {
      programId = existing.id; // déjà ajouté : on ouvre la fiche existante
    } else {
      const read = await readProgramFromUrl(url);
      const program = await service.create(
        ctx.organizationId,
        { name, agency, description: summary, program_type: "", territory: "", source_url: url },
        read
      );
      programId = program.id;
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/programs");
  redirect(`/programs/${programId}`);
}
