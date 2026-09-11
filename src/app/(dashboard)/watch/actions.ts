"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";

const ALLOWED = ["new", "to_review", "qualified", "ignored", "archived"] as const;
export async function updateOpportunityStatus(formData: FormData) {
  await requireOrgContext(); const supabase = await createClient();
  const id = String(formData.get("id") ?? ""); const status = String(formData.get("status") ?? "");
  if (!id || !ALLOWED.includes(status as (typeof ALLOWED)[number])) return;
  const { error } = await supabase.from("funding_opportunities").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  revalidatePath("/watch"); revalidatePath(`/watch/${id}`); revalidatePath("/dashboard");
}
export async function refreshFundingWatch() {
  const ctx = await requireOrgContext(); const supabase = await createClient();
  const { runBusinessFundingCollections } = await import("@/features/watch/collector");
  await runBusinessFundingCollections(supabase, ctx.organizationId);
  revalidatePath("/watch"); revalidatePath("/watch/sources"); revalidatePath("/dashboard");
}
