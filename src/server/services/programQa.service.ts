import type { SupabaseClient } from "@supabase/supabase-js";
import { programsRepository } from "@/server/repositories/programs.repository";
import { askProgram, MAX_QUESTION_LENGTH, type QaAnswer } from "@/features/programs/qa/ask";

type ClientCtx = { name: string; sector: string | null; website: string | null; current_needs: string | null; notes: string | null };

export type QaHistoryRow = { id: string; question: string; answer: QaAnswer; client_id: string | null; created_at: string };

export function programQaService(supabase: SupabaseClient) {
  return {
    // Pose une question sur un programme. L'historique est conservé (best effort : si l'enregistrement
    // échoue, la réponse est quand même renvoyée).
    async ask(
      ctx: { organizationId: string; organizationUserId: string },
      programId: string,
      question: string,
      clientId: string | null,
      includeGuides: boolean
    ): Promise<{ answer: QaAnswer; id: string | null }> {
      const text = question.trim();
      if (text.length < 3) throw new Error("Écris ta question.");
      if (text.length > MAX_QUESTION_LENGTH) throw new Error(`Question trop longue (maximum ${MAX_QUESTION_LENGTH} caractères).`);

      const program = await programsRepository(supabase).findById(programId);
      if (!program) throw new Error("Programme introuvable.");

      let client: ClientCtx | null = null;
      if (clientId) {
        const { data } = await supabase.from("clients").select("name, sector, website, current_needs, notes").eq("id", clientId).maybeSingle();
        if (!data) throw new Error("Client introuvable.");
        client = data as ClientCtx;
      }

      const answer = await askProgram({ program, question: text, client, includeGuides });

      let id: string | null = null;
      try {
        const { data } = await supabase
          .from("program_questions")
          .insert({ organization_id: ctx.organizationId, program_id: programId, client_id: clientId, question: text, answer, model: answer.model, created_by: ctx.organizationUserId })
          .select("id")
          .single();
        id = (data as { id: string } | null)?.id ?? null;
      } catch {
        /* historique facultatif */
      }
      return { answer, id };
    },

    async list(programId: string, limit = 10): Promise<QaHistoryRow[]> {
      try {
        const { data, error } = await supabase
          .from("program_questions")
          .select("id, question, answer, client_id, created_at")
          .eq("program_id", programId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return []; // ex. migration 0037 pas encore appliquée
        return (data ?? []) as QaHistoryRow[];
      } catch {
        return [];
      }
    },
  };
}
