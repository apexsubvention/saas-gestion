"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";

function csv(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function nullableNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

export async function createFundingOpportunity(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const officialSourceId = String(formData.get("official_source_id") ?? "").trim() || null;
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const fundingRatePercent = nullableNumber(formData.get("funding_rate"));

  const { data: opportunity, error } = await supabase
    .from("funding_opportunities")
    .insert({
      organization_id: ctx.organizationId,
      title,
      organization: String(formData.get("organization") ?? "").trim() || null,
      summary: String(formData.get("summary") ?? "").trim() || null,
      official_source_id: officialSourceId,
      official_url: officialUrl,
      external_url: officialUrl,
      source: officialSourceId ? "Source enregistrée" : null,
      funding_type: String(formData.get("funding_type") ?? "").trim() || null,
      min_amount: nullableNumber(formData.get("min_amount")),
      max_amount: nullableNumber(formData.get("max_amount")),
      funding_rate: fundingRatePercent == null ? null : fundingRatePercent / 100,
      open_date: String(formData.get("open_date") ?? "").trim() || null,
      deadline: String(formData.get("deadline") ?? "").trim() || null,
      categories: csv(formData.get("categories")),
      eligible_sectors: csv(formData.get("eligible_sectors")),
      eligible_expenses: csv(formData.get("eligible_expenses")),
      eligibility_criteria: String(formData.get("eligibility_criteria") ?? "").trim() || null,
      eligibility: String(formData.get("eligibility_criteria") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      relevance_score: nullableNumber(formData.get("relevance_score")),
      status: "new",
    })
    .select("id")
    .single();

  if (error) throw error;

  if (officialSourceId && officialUrl) {
    const { error: sourceLinkError } = await supabase.from("funding_opportunity_sources").insert({
      organization_id: ctx.organizationId,
      opportunity_id: opportunity.id,
      source_id: officialSourceId,
      source_url: officialUrl,
      match_status: "confirmed",
    });
    if (sourceLinkError) throw sourceLinkError;
  }

  const scopeLevel = String(formData.get("scope_level") ?? "canada");
  const province = String(formData.get("province_territory") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const mrc = String(formData.get("mrc_equivalent") ?? "").trim() || null;
  const municipality = String(formData.get("municipality") ?? "").trim() || null;

  const shouldInsertTerritory = scopeLevel === "canada" || province || region || mrc || municipality;
  if (shouldInsertTerritory) {
    const { error: territoryError } = await supabase.from("funding_opportunity_territories").insert({
      organization_id: ctx.organizationId,
      opportunity_id: opportunity.id,
      scope_level: scopeLevel,
      country_code: "CA",
      province_territory: province,
      region,
      mrc_equivalent: mrc,
      municipality,
    });
    if (territoryError) throw territoryError;
  }

  redirect(`/watch/${opportunity.id}`);
}
