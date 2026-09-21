"use server";

import { programSnapshotService } from "@/server/services/programSnapshot.service";
import { logDossierEvent } from "@/server/services/audit";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { requireOrgContext } from "@/lib/permissions";
import { createGrantProjectSchema } from "@/features/grants/schemas";

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
    return { error: formatCaughtError(e) };
  }

  // Règles du programme figées à la création + première ligne du journal (best effort : n'échouent jamais la création).
  await programSnapshotService(supabase).takeOnCreation(ctx, project.id, parsed.data.program_id);
  await logDossierEvent(supabase, ctx, { grant_project_id: project.id, client_id: parsed.data.client_id, kind: "dossier_created", title: `Dossier créé : ${parsed.data.name}`, detail: "Règles du programme figées à cette date.", source: "manual" });

  redirect(`/grants/${project.id}`);
}
