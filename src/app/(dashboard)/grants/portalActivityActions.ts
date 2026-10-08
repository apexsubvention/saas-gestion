"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { portalActivityService } from "@/server/services/portalActivity.service";

// « Traité » sur le résumé d'activité du portail (0076) -- une ligne, ou plusieurs d'un coup.
export async function setPortalActivityHandledAction(keys: string[], handled: boolean): Promise<{ error: string | null }> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const service = portalActivityService(supabase);
    for (const key of keys.slice(0, 200)) {
      const [refKind, refId] = key.split(":");
      if ((refKind !== "event" && refKind !== "note") || !refId) continue;
      await service.setHandled({ organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId }, refKind, refId, handled);
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath("/grants");
  return { error: null };
}
