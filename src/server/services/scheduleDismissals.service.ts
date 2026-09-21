import type { SupabaseClient } from "@supabase/supabase-js";

// Mémoire des éléments AUTOMATIQUES supprimés à la main (voir src/features/schedule/dismissals.ts).
// « Best effort » : si la migration 0040 n'est pas encore appliquée, tout continue de fonctionner
// (rien n'est retenu, l'ancien comportement s'applique).

type Ctx = { organizationId: string; organizationUserId: string };
export type DismissalKind = "claim" | "milestone";

export function scheduleDismissalsService(supabase: SupabaseClient) {
  return {
    async keys(grantProjectId: string, kind: DismissalKind): Promise<Set<string>> {
      try {
        const { data, error } = await supabase.from("schedule_dismissals").select("dedupe_key").eq("grant_project_id", grantProjectId).eq("kind", kind);
        if (error) return new Set();
        return new Set((data ?? []).map((r: { dedupe_key: string }) => r.dedupe_key));
      } catch {
        return new Set();
      }
    },

    // Sans .select() : pas de RETURNING. Un doublon (déjà retenu) n'est pas une erreur.
    async add(ctx: Ctx, grantProjectId: string, kind: DismissalKind, dedupeKey: string): Promise<void> {
      try {
        await supabase.from("schedule_dismissals").insert({
          organization_id: ctx.organizationId,
          grant_project_id: grantProjectId,
          kind,
          dedupe_key: dedupeKey.slice(0, 300),
          created_by: ctx.organizationUserId,
        });
      } catch {
        /* facultatif */
      }
    },

    // key absente : tout ce type est de nouveau autorisé (ex. clic explicite sur « Suggérer l'échéancier »).
    async clear(grantProjectId: string, kind: DismissalKind, dedupeKey?: string): Promise<void> {
      try {
        let q = supabase.from("schedule_dismissals").delete().eq("grant_project_id", grantProjectId).eq("kind", kind);
        if (dedupeKey) q = q.eq("dedupe_key", dedupeKey);
        await q;
      } catch {
        /* facultatif */
      }
    },
  };
}
