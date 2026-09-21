"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { questionnaireService } from "@/server/services/questionnaire.service";
import { logDossierEvent } from "@/server/services/audit";
import type { CopilotResult, DraftMeta } from "@/features/drafting/questionnaire";

const uuid = z.string().uuid();
const path = (id: string) => `/grants/${id}/redaction`;

export type QActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function importQuestionsAction(grantProjectId: string, text: string): Promise<QActionResult<{ added: number; skipped: number }>> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const r = await questionnaireService(supabase).importQuestions(ctx, grantProjectId, String(text ?? ""));
    if (r.added > 0) {
      await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "questionnaire_imported", title: `Questionnaire : ${r.added} question(s) importée(s)`, source: "manual" });
    }
    revalidatePath(path(grantProjectId));
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

// Réponse proposée par Apex : sauvegardée à part (ai_draft), sans écraser la version de l'utilisateur.
export async function draftAnswerAction(grantProjectId: string, questionId: string, extraContext: string): Promise<QActionResult<{ ai_draft: string; ai_meta: DraftMeta }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "Question invalide." };
  const supabase = await createClient();
  try {
    const r = await questionnaireService(supabase).draft(ctx, grantProjectId, questionId, String(extraContext ?? ""));
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "answer_drafted", title: "Réponse proposée par Apex", detail: `Confiance : ${r.ai_meta.confidence}`, source: "ai", ref_type: "application_question", ref_id: questionId });
    revalidatePath(path(grantProjectId));
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

export async function saveAnswerAction(grantProjectId: string, questionId: string, userDraft: string | null, finalText: string | null | undefined): Promise<QActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "Question invalide." };
  const supabase = await createClient();
  try {
    await questionnaireService(supabase).saveAnswer(ctx, grantProjectId, questionId, { user_draft: userDraft, ...(finalText !== undefined ? { final_text: finalText } : {}) });
    if (finalText) {
      await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "answer_finalized", title: "Réponse marquée comme finale", source: "manual", ref_type: "application_question", ref_id: questionId });
    }
    revalidatePath(path(grantProjectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

const copilotSchema = z.object({
  instruction: z.string().trim().min(3, "Écris une consigne pour le copilote.").max(1000),
  currentText: z.string().max(20_000),
  keepNumbers: z.boolean(),
  maxChars: z.number().int().min(50).max(20_000).nullable(),
  extraContext: z.string().max(6000).optional(),
});

export async function copilotAction(
  grantProjectId: string,
  questionId: string,
  input: { instruction: string; currentText: string; keepNumbers: boolean; maxChars: number | null; extraContext?: string }
): Promise<QActionResult<{ result: CopilotResult }>> {
  await requireOrgContext();
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "Question invalide." };
  const parsed = copilotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Consigne invalide." };
  const supabase = await createClient();
  try {
    return { ok: true, result: await questionnaireService(supabase).copilot(grantProjectId, questionId, parsed.data) };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}

export async function removeQuestionAction(grantProjectId: string, questionId: string): Promise<QActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "Question invalide." };
  const supabase = await createClient();
  try {
    const removed = await questionnaireService(supabase).removeQuestion(grantProjectId, questionId);
    if (removed === 0) return { ok: false, error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    revalidatePath(path(grantProjectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}
