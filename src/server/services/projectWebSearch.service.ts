import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectWebSearchesRepository } from "@/server/repositories/projectWebSearches.repository";
import { normalizeSearchText } from "@/features/watch/search";
import { deepSearchProject } from "@/features/watch/webSearch/deepSearch";
import type { DeepSearchResult } from "@/features/watch/webSearch/types";

const CACHE_DAYS = 7;
const DEFAULT_DAILY_LIMIT = 20;

export const MIN_PROJECT_LENGTH = 10;
export const MAX_PROJECT_LENGTH = 1500;

export function hashProject(project: string) {
  return createHash("sha256").update(normalizeSearchText(project)).digest("hex");
}

function dailyLimit() {
  const n = Number(process.env.DEEP_SEARCH_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

export function projectWebSearchService(supabase: SupabaseClient) {
  const repo = projectWebSearchesRepository(supabase);

  async function getCached(organizationId: string, project: string): Promise<DeepSearchResult | null> {
    const row = await repo.find(organizationId, hashProject(project));
    if (!row) return null;
    const ageMs = Date.now() - new Date(row.searched_at).getTime();
    return ageMs <= CACHE_DAYS * 86_400_000 ? row.results : null;
  }

  return {
    getCached,

    // Renvoie le résultat en cache (recherche identique < 7 jours) sauf `force`. Sinon lance une
    // recherche payante, dans la limite quotidienne de l'organisation (coût).
    async run(ctx: { organizationId: string; organizationUserId: string }, project: string, force: boolean): Promise<{ result: DeepSearchResult; cached: boolean }> {
      const text = project.trim();
      if (text.length < MIN_PROJECT_LENGTH) throw new Error("Décris un peu plus le projet pour lancer une recherche web.");
      if (text.length > MAX_PROJECT_LENGTH) throw new Error(`Description trop longue (maximum ${MAX_PROJECT_LENGTH} caractères).`);

      if (!force) {
        const cached = await getCached(ctx.organizationId, text);
        if (cached) return { result: cached, cached: true };
      }

      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const used = await repo.countSince(ctx.organizationId, startOfDay.toISOString());
      if (used >= dailyLimit()) {
        throw new Error(`Limite quotidienne de ${dailyLimit()} recherches web approfondies atteinte pour aujourd'hui. Réessaie demain.`);
      }

      const result = await deepSearchProject(text);
      await repo.save({
        organization_id: ctx.organizationId,
        query_hash: hashProject(text),
        query_text: text,
        results: result,
        model: result.model,
        created_by: ctx.organizationUserId,
      });
      return { result, cached: false };
    },
  };
}
