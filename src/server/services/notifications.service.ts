import type { SupabaseClient } from "@supabase/supabase-js";

// Notifications INTERNES (personnel -> personnel). Écriture « best effort » et SANS `.select()` : seul le
// destinataire peut lire sa notification (RLS), donc un RETURNING serait refusé pour l'expéditeur.

type Ctx = { organizationId: string; organizationUserId: string };

export type NotificationType = "task_assigned" | "ai_review" | "general" | "deadline" | "claim_due" | "opportunity_interest";

export type NotificationRow = {
  id: string;
  type: string;
  message: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
};

export async function notifyUser(
  supabase: SupabaseClient,
  ctx: Ctx,
  n: { userId: string | null; type: NotificationType; message: string; href?: string | null; entity_type?: string | null; entity_id?: string | null }
): Promise<void> {
  if (!n.userId || n.userId === ctx.organizationUserId) return; // jamais de notification à soi-même
  try {
    await supabase.from("notifications").insert({
      organization_id: ctx.organizationId,
      user_id: n.userId,
      type: n.type,
      message: n.message.slice(0, 500),
      href: n.href ?? null,
      entity_type: n.entity_type ?? null,
      entity_id: n.entity_id ?? null,
    });
  } catch {
    /* notification facultative */
  }
}

export function notificationsService(supabase: SupabaseClient) {
  return {
    async unreadCount(): Promise<number> {
      try {
        const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
        return error ? 0 : count ?? 0;
      } catch {
        return 0;
      }
    },
    async listMine(limit = 60): Promise<NotificationRow[]> {
      try {
        const { data, error } = await supabase.from("notifications").select("id, type, message, href, read, created_at").order("created_at", { ascending: false }).limit(limit);
        return error ? [] : ((data ?? []) as NotificationRow[]);
      } catch {
        return [];
      }
    },
    async markRead(id: string): Promise<void> {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    async markAllRead(): Promise<void> {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
      if (error) throw error;
    },
  };
}
