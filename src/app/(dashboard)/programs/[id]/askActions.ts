"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { programQaService } from "@/server/services/programQa.service";
import type { QaAnswer } from "@/features/programs/qa/ask";

export type AskProgramResult = { ok: true; answer: QaAnswer; id: string | null } | { ok: false; error: string };

// « Pose-moi tes questions » : réponse tirée uniquement des documents du programme, avec citations.
export async function askProgramAction(programId: string, question: string, clientId: string | null, includeGuides: boolean): Promise<AskProgramResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const { answer, id } = await programQaService(supabase).ask(ctx, programId, String(question ?? ""), clientId || null, includeGuides === true);
    return { ok: true, answer, id };
  } catch (e) {
    return { ok: false, error: formatCaughtError(e) };
  }
}
