"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { aiSuggestionsService } from "@/server/services/aiSuggestions.service";
import { logAudit, logDossierEvent } from "@/server/services/audit";

export type SuggestionActionResult = { error: string | null; report: string[] };

const idsSchema = z.array(z.string().uuid()).min(1, "Coche au moins une proposition.").max(60);

// Applique les propositions COCHÉES (rien n'est appliqué sans cette confirmation).
export async function applySuggestionsAction(grantProjectId: string, ids: string[]): Promise<SuggestionActionResult> {
  const ctx = await requireOrgContext();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Sélection invalide.", report: [] };

  const supabase = await createClient();
  try {
    const report = await aiSuggestionsService(supabase).apply(ctx, grantProjectId, parsed.data);
    await logAudit(supabase, ctx, { action: "ai_suggestions_applied", entity_type: "grant_project", entity_id: grantProjectId, after: { suggestion_ids: parsed.data, report } });
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "ai_suggestions_applied",
      title: `${report.length} proposition(s) d'Apex appliquée(s) après confirmation`,
      detail: report.join(" "),
      source: "ai",
    });
    revalidatePath(`/grants/${grantProjectId}`);
    revalidatePath("/echeancier");
    return { error: null, report };
  } catch (e) {
    return { error: formatCaughtError(e), report: [] };
  }
}

export async function dismissSuggestionAction(grantProjectId: string, id: string): Promise<SuggestionActionResult> {
  const ctx = await requireOrgContext();
  if (!z.string().uuid().safeParse(id).success) return { error: "Proposition invalide.", report: [] };
  const supabase = await createClient();
  try {
    await aiSuggestionsService(supabase).dismiss(ctx, id);
    revalidatePath(`/grants/${grantProjectId}`);
    return { error: null, report: [] };
  } catch (e) {
    return { error: formatCaughtError(e), report: [] };
  }
}
