"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { draftingService } from "@/server/services/drafting.service";
import { logDossierEvent } from "@/server/services/audit";
import type { AnalysisResult } from "@/features/drafting/analyze";
import type { ExpenseCheck } from "@/features/drafting/expense";

export type AnalyzeActionResult = { ok: true; result: AnalysisResult; id: string | null } | { ok: false; error: string };
export type ExpenseActionResult = { ok: true; check: ExpenseCheck } | { ok: false; error: string };

// « Explique-moi ton projet » -> analyse de compatibilité (pourcentage calculé par Apex, jamais une probabilité).
export async function analyzeProjectAction(grantProjectId: string, projectText: string): Promise<AnalyzeActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const { result, id } = await draftingService(supabase).analyze(ctx, grantProjectId, String(projectText ?? ""));
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "project_analyzed",
      title: "Analyse de compatibilité du projet",
      detail: result.compatibility.headline,
      source: "ai",
      ref_type: "project_analysis",
      ref_id: id,
    });
    revalidatePath(`/grants/${grantProjectId}/redaction`);
    return { ok: true, result, id };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

// Budget intelligent : une dépense est-elle admissible selon les documents du programme ?
export async function checkExpenseAction(grantProjectId: string, expense: string, amount: number | null): Promise<ExpenseActionResult> {
  await requireOrgContext();
  if (amount != null && (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000)) return { ok: false, error: "Montant invalide." };
  const supabase = await createClient();
  try {
    return { ok: true, check: await draftingService(supabase).checkExpense(grantProjectId, String(expense ?? ""), amount) };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}
