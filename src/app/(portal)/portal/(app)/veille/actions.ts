"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortalContext } from "@/lib/portal/auth";
import { submitOpportunityInterest } from "@/server/services/clientOpportunityInterests.service";
import { formatCaughtError } from "@/lib/errors";

export type SendOpportunityInterestFormState = { error: string | null; ok?: boolean; alreadySent?: boolean };

export async function sendOpportunityInterestAction(
  _prev: SendOpportunityInterestFormState,
  formData: FormData
): Promise<SendOpportunityInterestFormState> {
  const ctx = await requirePortalContext();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!opportunityId) {
    return { error: "Opportunité manquante." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  try {
    const { created } = await submitOpportunityInterest(
      supabase,
      admin,
      { organizationId: ctx.organizationId, clientId: ctx.clientId, clientName: ctx.clientName, organizationUserId: ctx.organizationUserId },
      { opportunityId, note: note || null }
    );
    if (!created) {
      return { error: null, ok: true, alreadySent: true };
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal/veille");
  return { error: null, ok: true };
}
