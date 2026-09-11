"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";

export async function createFundingSource(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("base_url") ?? "").trim();
  if (!name || !baseUrl) return;

  const { error } = await supabase.from("funding_sources").insert({
    organization_id: ctx.organizationId,
    name,
    base_url: baseUrl,
    source_family: String(formData.get("source_family") ?? "other"),
    geographic_level: String(formData.get("geographic_level") ?? "other"),
    territory_label: String(formData.get("territory_label") ?? "").trim() || null,
    is_official: formData.get("is_official") === "true",
    priority: Number(formData.get("priority") ?? 2),
    collection_method: String(formData.get("collection_method") ?? "manual"),
    health_status: "never_checked",
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) throw error;
  redirect("/watch/sources");
}
