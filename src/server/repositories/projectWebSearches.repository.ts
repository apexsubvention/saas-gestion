import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSearchResult } from "@/features/watch/webSearch/types";

export type ProjectWebSearchRow = {
  id: string;
  organization_id: string;
  query_hash: string;
  query_text: string;
  results: DeepSearchResult;
  model: string | null;
  searched_at: string;
};

export function projectWebSearchesRepository(supabase: SupabaseClient) {
  return {
    async find(organizationId: string, queryHash: string): Promise<ProjectWebSearchRow | null> {
      const { data, error } = await supabase
        .from("project_web_searches")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("query_hash", queryHash)
        .maybeSingle();
      if (error) throw error;
      return data as ProjectWebSearchRow | null;
    },
    // Une relance remplace la ligne existante (même organisation + même texte normalisé).
    async save(input: { organization_id: string; query_hash: string; query_text: string; results: DeepSearchResult; model: string; created_by: string }): Promise<void> {
      const { error } = await supabase
        .from("project_web_searches")
        .upsert({ ...input, searched_at: new Date().toISOString() }, { onConflict: "organization_id,query_hash" });
      if (error) throw error;
    },
    async countSince(organizationId: string, sinceIso: string): Promise<number> {
      const { count, error } = await supabase
        .from("project_web_searches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("searched_at", sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
  };
}
