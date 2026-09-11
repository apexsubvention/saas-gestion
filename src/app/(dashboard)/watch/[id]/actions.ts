"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";

export async function linkOpportunitySource(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const sourceId = String(formData.get("source_id") ?? "");
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  if (!opportunityId || !sourceId || !sourceUrl) return;

  const { error } = await supabase.from("funding_opportunity_sources").insert({
    organization_id: ctx.organizationId,
    opportunity_id: opportunityId,
    source_id: sourceId,
    source_url: sourceUrl,
    match_status: "confirmed",
  });
  if (error) throw error;

  revalidatePath(`/watch/${opportunityId}`);
  revalidatePath("/watch");
}

export async function addOpportunityTerritory(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  if (!opportunityId) return;

  const { error } = await supabase.from("funding_opportunity_territories").insert({
    organization_id: ctx.organizationId,
    opportunity_id: opportunityId,
    scope_level: String(formData.get("scope_level") ?? "canada"),
    country_code: "CA",
    province_territory: String(formData.get("province_territory") ?? "").trim() || null,
    region: String(formData.get("region") ?? "").trim() || null,
    mrc_equivalent: String(formData.get("mrc_equivalent") ?? "").trim() || null,
    municipality: String(formData.get("municipality") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath(`/watch/${opportunityId}`);
  revalidatePath("/watch");
}

export async function refreshOpportunityOfficialDetails(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  if (!opportunityId) return;

  const { data: item, error } = await supabase.from("funding_opportunities").select("*").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  if (!item?.official_url) return;

  const { enrichOfficialOpportunity } = await import("@/features/watch/connectors/officialPageEnrichment");
  const enriched = await enrichOfficialOpportunity({
    canonicalKey: item.canonical_key ?? `manual:${item.id}`,
    title: item.title ?? "Programme",
    summary: item.summary,
    officialUrl: item.official_url,
    organization: item.organization ?? "Organisme",
    territory: item.territory ?? "Canada",
    fundingType: (item.funding_type ?? "other") as "grant" | "contribution" | "loan" | "financing" | "wage_subsidy" | "internship" | "call_for_projects" | "tax_credit" | "tax_incentive" | "equity" | "advisory" | "other",
    categories: item.categories ?? [],
    rawContent: item.raw_content ?? "",
    maxAmount: item.max_amount,
    openDate: item.open_date,
    deadline: item.deadline,
    availabilityStatus: (item.availability_status ?? "unknown") as "open" | "opening_soon" | "continuous" | "closed" | "unknown",
    expectedOpenDate: item.expected_open_date,
    preparationDocuments: item.preparation_documents ?? [],
    preparationNotes: item.preparation_notes,
    preparationSourceUrl: item.preparation_source_url,
  });

  const now = new Date().toISOString();
  const { error: updateError } = await supabase.from("funding_opportunities").update({
    raw_content: enriched.rawContent,
    max_amount: enriched.maxAmount ?? item.max_amount,
    open_date: enriched.openDate ?? item.open_date,
    deadline: enriched.deadline ?? item.deadline,
    availability_status: enriched.availabilityStatus ?? item.availability_status,
    expected_open_date: enriched.expectedOpenDate ?? item.expected_open_date,
    funding_rate_max: enriched.fundingRateMax ?? item.funding_rate_max,
    min_eligible_spend: enriched.minEligibleSpend ?? item.min_eligible_spend,
    private_contribution_min_rate: enriched.privateContributionMinRate ?? item.private_contribution_min_rate,
    stacking_limit_rate: enriched.stackingLimitRate ?? item.stacking_limit_rate,
    intake_start_at: enriched.intakeStartAt ?? item.intake_start_at,
    intake_end_at: enriched.intakeEndAt ?? item.intake_end_at,
    government_priorities: (enriched.governmentPriorities?.length ? enriched.governmentPriorities : item.government_priorities) ?? [],
    official_page_updated_at: enriched.officialPageUpdatedAt ?? item.official_page_updated_at,
    deep_read_at: enriched.deepReadAt ?? now,
    last_verified_at: now,
    last_checked_at: now,
    updated_at: now,
  }).eq("id", opportunityId).eq("organization_id", ctx.organizationId);
  if (updateError) throw updateError;

  revalidatePath(`/watch/${opportunityId}`);
  revalidatePath("/watch");
}

export async function refreshFundingAwardExamples(formData: FormData) {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  if (!opportunityId) return;

  const { data: item, error } = await supabase.from("funding_opportunities").select("id,title,organization").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  if (!item) return;

  const hint = `${item.title ?? ""} ${item.organization ?? ""}`;
  const { collectOpenCanadaAwards } = await import("@/features/watch/connectors/openCanadaAwards");
  const awards = await collectOpenCanadaAwards(hint, 10);

  for (const award of awards) {
    const { error: upsertError } = await supabase.from("funding_awards").upsert({
      organization_id: ctx.organizationId,
      opportunity_id: opportunityId,
      program_name: award.programName,
      recipient_name: award.recipientName,
      recipient_type: award.recipientType,
      project_title: award.projectTitle,
      description: award.description,
      amount: award.amount,
      agreement_start_date: award.agreementStartDate,
      agreement_end_date: award.agreementEndDate,
      location: award.location,
      federal_organization: award.federalOrganization,
      agreement_number: award.agreementNumber,
      source_url: award.sourceUrl,
      source_system: "open_canada",
      raw_content: award.rawContent,
      detected_at: new Date().toISOString(),
    }, { onConflict: "organization_id,source_url" });
    if (upsertError) throw upsertError;
  }

  revalidatePath(`/watch/${opportunityId}`);
}
