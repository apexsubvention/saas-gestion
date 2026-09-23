import type { SupabaseClient } from "@supabase/supabase-js";
import { draftingService } from "@/server/services/drafting.service";
import { draftAnswer, parseQuestions, runCopilot, MAX_ANSWER_CHARS, type CopilotResult, type DraftMeta } from "@/features/drafting/questionnaire";
import { normalizeSearchText } from "@/features/watch/search";

type Ctx = { organizationId: string; organizationUserId: string };

export type AnswerRow = { id: string | null; ai_draft: string | null; user_draft: string | null; final_text: string | null; ai_meta: DraftMeta | null; updated_at: string | null };
export type QuestionItem = { id: string; prompt: string; order_index: number; answer: AnswerRow };
export type QuestionnaireData = { applicationId: string | null; items: QuestionItem[] };

const EMPTY_ANSWER: AnswerRow = { id: null, ai_draft: null, user_draft: null, final_text: null, ai_meta: null, updated_at: null };

// Questionnaire d'une demande : grant_applications -> application_sections -> application_questions -> application_answers
// (tables existantes ; aucune structure dupliquée). Historiquement réservé au personnel
// (RLS, cf. 0038) ; le portail y a maintenant aussi accès EN LECTURE SEULE (0044, décision
// explicite de Jade) pour afficher le texte rédigé au client, pour révision -- voir
// portalDossiers.service.ts. Rien n'a changé ici : c'est la RLS de la base, pas ce
// service, qui distingue les deux cas.
export function questionnaireService(supabase: SupabaseClient) {
  const drafting = draftingService(supabase);

  async function get(grantProjectId: string): Promise<QuestionnaireData> {
    try {
      const { data: apps, error } = await supabase.from("grant_applications").select("id").eq("grant_project_id", grantProjectId).order("created_at", { ascending: true });
      if (error || !apps || apps.length === 0) return { applicationId: null, items: [] };
      const applicationId = (apps[0] as { id: string }).id;

      const { data: sections } = await supabase.from("application_sections").select("id, order_index").eq("application_id", applicationId).order("order_index", { ascending: true });
      const sectionIds = ((sections ?? []) as Array<{ id: string }>).map((s) => s.id);
      if (sectionIds.length === 0) return { applicationId, items: [] };

      const { data: questions } = await supabase.from("application_questions").select("id, prompt, order_index, section_id").in("section_id", sectionIds).order("order_index", { ascending: true });
      const qs = (questions ?? []) as Array<{ id: string; prompt: string; order_index: number; section_id: string }>;
      if (qs.length === 0) return { applicationId, items: [] };

      const { data: answers } = await supabase.from("application_answers").select("id, question_id, ai_draft, user_draft, final_text, ai_meta, updated_at").in("question_id", qs.map((q) => q.id));
      const byQuestion = new Map(((answers ?? []) as Array<AnswerRow & { question_id: string }>).map((a) => [a.question_id, a]));
      return {
        applicationId,
        items: qs.map((q) => {
          const a = byQuestion.get(q.id);
          return { id: q.id, prompt: q.prompt, order_index: q.order_index, answer: a ? { id: a.id, ai_draft: a.ai_draft, user_draft: a.user_draft, final_text: a.final_text, ai_meta: a.ai_meta, updated_at: a.updated_at } : EMPTY_ANSWER };
        }),
      };
    } catch {
      return { applicationId: null, items: [] };
    }
  }

  async function ownedQuestion(grantProjectId: string, questionId: string): Promise<QuestionItem> {
    const found = (await get(grantProjectId)).items.find((q) => q.id === questionId);
    if (!found) throw new Error("Question introuvable dans ce dossier.");
    return found;
  }

  // La description du projet : la dernière analyse si elle existe, sinon les besoins actuels du client.
  async function projectText(grantProjectId: string, fallback: string | null): Promise<string> {
    const last = (await drafting.listAnalyses(grantProjectId, 1))[0];
    return (last?.description ?? fallback ?? "").slice(0, 6000);
  }

  async function upsertAnswer(ctx: Ctx, questionId: string, patch: Partial<Pick<AnswerRow, "ai_draft" | "user_draft" | "final_text" | "ai_meta">>) {
    const { data: existing, error: findError } = await supabase.from("application_answers").select("id").eq("question_id", questionId).maybeSingle();
    if (findError) throw findError;
    const stamp = { ...patch, updated_at: new Date().toISOString() };
    if (existing) {
      const { error } = await supabase.from("application_answers").update(stamp).eq("id", (existing as { id: string }).id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("application_answers").insert({ organization_id: ctx.organizationId, question_id: questionId, ...stamp });
      if (error) throw error;
    }
  }

  return {
    get,

    // Importe des questions depuis du texte collé. Les questions déjà présentes (même libellé) sont ignorées.
    async importQuestions(ctx: Ctx, grantProjectId: string, rawText: string): Promise<{ added: number; skipped: number }> {
      const questions = parseQuestions(rawText);
      if (questions.length === 0) throw new Error("Aucune question détectée : colle les questions du formulaire, une par ligne ou numérotées.");

      const current = await get(grantProjectId);
      let applicationId = current.applicationId;
      if (!applicationId) {
        const { data, error } = await supabase.from("grant_applications").insert({ organization_id: ctx.organizationId, grant_project_id: grantProjectId }).select("id").single();
        if (error) throw error;
        applicationId = (data as { id: string }).id;
      }

      let sectionId: string;
      const { data: sections, error: secError } = await supabase.from("application_sections").select("id").eq("application_id", applicationId).order("order_index", { ascending: true });
      if (secError) throw secError;
      if (sections && sections.length > 0) sectionId = (sections[0] as { id: string }).id;
      else {
        const { data, error } = await supabase.from("application_sections").insert({ organization_id: ctx.organizationId, application_id: applicationId, title: "Questionnaire", order_index: 0 }).select("id").single();
        if (error) throw error;
        sectionId = (data as { id: string }).id;
      }

      const known = new Set(current.items.map((q) => normalizeSearchText(q.prompt)));
      const fresh = questions.filter((q) => !known.has(normalizeSearchText(q)));
      const start = current.items.reduce((m, q) => Math.max(m, q.order_index), -1) + 1;
      if (fresh.length > 0) {
        const { error } = await supabase.from("application_questions").insert(fresh.map((prompt, i) => ({ organization_id: ctx.organizationId, section_id: sectionId, prompt, order_index: start + i })));
        if (error) throw error;
      }
      return { added: fresh.length, skipped: questions.length - fresh.length };
    },

    // Réponse proposée par Apex : enregistrée dans ai_draft (+ sources, confiance, informations manquantes dans ai_meta).
    // Ne touche JAMAIS à user_draft / final_text : le travail de l'utilisateur n'est pas écrasé.
    async draft(ctx: Ctx, grantProjectId: string, questionId: string, extraContext?: string): Promise<{ ai_draft: string; ai_meta: DraftMeta }> {
      const question = await ownedQuestion(grantProjectId, questionId);
      const loaded = await drafting.load(grantProjectId);
      const result = await draftAnswer({ docs: loaded.docs, context: loaded.context, projectText: await projectText(grantProjectId, loaded.clientNeeds), question: question.prompt, extraContext });
      await upsertAnswer(ctx, questionId, { ai_draft: result.answer, ai_meta: result.meta });
      return { ai_draft: result.answer, ai_meta: result.meta };
    },

    async saveAnswer(ctx: Ctx, grantProjectId: string, questionId: string, patch: { user_draft?: string | null; final_text?: string | null }) {
      await ownedQuestion(grantProjectId, questionId);
      for (const v of [patch.user_draft, patch.final_text]) if (v && v.length > MAX_ANSWER_CHARS) throw new Error(`Réponse trop longue (maximum ${MAX_ANSWER_CHARS} caractères).`);
      await upsertAnswer(ctx, questionId, patch);
    },

    async copilot(
      grantProjectId: string,
      questionId: string,
      opts: { instruction: string; currentText: string; keepNumbers: boolean; maxChars: number | null; extraContext?: string }
    ): Promise<CopilotResult> {
      const instruction = opts.instruction.trim();
      if (instruction.length < 3) throw new Error("Écris une consigne pour le copilote.");
      if (instruction.length > 1000) throw new Error("Consigne trop longue (1 000 caractères maximum).");
      const question = await ownedQuestion(grantProjectId, questionId);
      const loaded = await drafting.load(grantProjectId);
      return runCopilot({
        docs: loaded.docs,
        context: loaded.context,
        projectText: await projectText(grantProjectId, loaded.clientNeeds),
        question: question.prompt,
        currentText: opts.currentText.slice(0, MAX_ANSWER_CHARS),
        instruction,
        keepNumbers: opts.keepNumbers,
        maxChars: opts.maxChars,
        extraContext: opts.extraContext,
      });
    },

    // Retire une question (et sa réponse, en cascade) : utile après un import par erreur.
    async removeQuestion(grantProjectId: string, questionId: string): Promise<number> {
      await ownedQuestion(grantProjectId, questionId);
      const { data, error } = await supabase.from("application_questions").delete().eq("id", questionId).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
  };
}
