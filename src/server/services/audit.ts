import type { SupabaseClient } from "@supabase/supabase-js";

// Journal d'audit (modifications importantes) et journal de dossier (timeline).
//
// « Best effort » : une erreur d'écriture du journal ne doit JAMAIS faire échouer l'action de
// l'utilisateur (ex. migration 0036 pas encore appliquée). Les insertions se font SANS `.select()` :
// audit_logs n'est lisible que par les admins, donc un RETURNING serait refusé pour un employé.

type Ctx = { organizationId: string; organizationUserId: string };

export async function logAudit(
  supabase: SupabaseClient,
  ctx: Ctx,
  entry: { action: string; entity_type: string; entity_id?: string | null; before?: unknown; after?: unknown }
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      organization_id: ctx.organizationId,
      user_id: ctx.organizationUserId,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch {
    /* journal facultatif */
  }
}

export async function logDossierEvent(
  supabase: SupabaseClient,
  ctx: Ctx,
  event: {
    grant_project_id: string;
    client_id?: string | null;
    kind: string;
    title: string;
    detail?: string | null;
    source?: "manual" | "system" | "ai" | "portal";
    ref_type?: string | null;
    ref_id?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("dossier_events").insert({
      organization_id: ctx.organizationId,
      grant_project_id: event.grant_project_id,
      client_id: event.client_id ?? null,
      kind: event.kind,
      title: event.title.slice(0, 300),
      detail: event.detail ? event.detail.slice(0, 2000) : null,
      source: event.source ?? "system",
      ref_type: event.ref_type ?? null,
      ref_id: event.ref_id ?? null,
      created_by: ctx.organizationUserId,
    });
  } catch {
    /* journal facultatif */
  }
}

export type DossierEventRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  source: "manual" | "system" | "ai" | "portal";
  occurred_at: string;
};

export async function listDossierEvents(supabase: SupabaseClient, grantProjectId: string, limit = 40): Promise<DossierEventRow[]> {
  try {
    const { data, error } = await supabase
      .from("dossier_events")
      .select("id, kind, title, detail, source, occurred_at")
      .eq("grant_project_id", grantProjectId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as DossierEventRow[];
  } catch {
    return [];
  }
}
