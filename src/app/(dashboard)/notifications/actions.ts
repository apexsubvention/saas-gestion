"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { notificationsService } from "@/server/services/notifications.service";

// RLS : seul le destinataire peut lire / modifier sa notification.
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  await requireOrgContext();
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await notificationsService(supabase).markRead(id);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await requireOrgContext();
  const supabase = await createClient();
  await notificationsService(supabase).markAllRead();
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
