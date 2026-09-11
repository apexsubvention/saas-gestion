import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { collectQuebecFinancialAid, QUEBEC_SOURCE, type CollectedOpportunity } from "./connectors/quebec";
import { collectInvestQuebecPrograms, INVEST_QUEBEC_SOURCE } from "./connectors/investQuebec";
import { PRIORITY_EMPLOYMENT_CONNECTORS } from "./connectors/priorityEmployment";
import { collectPsce, PSCE_SOURCE } from "./connectors/priorityBusinessPrograms";
import { classifyBusinessAudience } from "./businessClassification";
import { PRIORITY_BUSINESS_SOURCES } from "./sourceCatalog";

type Client = SupabaseClient<Database>;
type SourceDef = { name: string; baseUrl: string; sourceFamily: string; geographicLevel: string; territoryLabel: string; isOfficial?: boolean };
export type CollectionSummary = { discovered: number; created: number; updated: number; sourceName: string; error?: string };

export async function ensurePrioritySources(supabase: Client, organizationId: string) {
  for (const source of PRIORITY_BUSINESS_SOURCES) {
    const { error } = await supabase.from("funding_sources").upsert({
      organization_id: organizationId,
      name: source.name,
      base_url: source.baseUrl,
      source_family: source.sourceFamily,
      geographic_level: source.geographicLevel,
      territory_label: source.territoryLabel,
      is_official: source.isOfficial,
      active: true,
      priority: source.priority,
      collection_method: source.collectionMethod,
      notes: source.notes,
    }, { onConflict: "organization_id,base_url", ignoreDuplicates: true });
    if (error) throw error;
  }
}

async function getOrCreateSource(supabase: Client, organizationId: string, source: SourceDef) {
  const { data: existing, error: readError } = await supabase.from("funding_sources").select("id").eq("organization_id", organizationId).eq("base_url", source.baseUrl).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("funding_sources").insert({
    organization_id: organizationId, name: source.name, base_url: source.baseUrl,
    source_family: source.sourceFamily, geographic_level: source.geographicLevel,
    territory_label: source.territoryLabel, is_official: source.isOfficial ?? true,
    active: true, priority: 1, collection_method: "scrape", health_status: "never_checked",
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function runConnector(supabase: Client, organizationId: string, source: SourceDef, collect: () => Promise<CollectedOpportunity[]>): Promise<CollectionSummary> {
  const sourceId = await getOrCreateSource(supabase, organizationId, source);
  const { data: run, error: runError } = await supabase.from("funding_collection_runs").insert({ organization_id: organizationId, source_id: sourceId, status: "running" }).select("id").single();
  if (runError) throw runError;
  try {
    const items = await collect();
    let created = 0; let updated = 0;
    const now = new Date().toISOString();
    for (const item of items) {
      const classification = classifyBusinessAudience({ title: item.title, summary: item.summary, rawContent: item.rawContent });
      const { data: existing, error: existingError } = await supabase.from("funding_opportunities").select("id,title,official_url,target_audience,business_relevance_score").eq("organization_id", organizationId).eq("canonical_key", item.canonicalKey).maybeSingle();
      if (existingError) throw existingError;
      let opportunityId: string;
      if (!existing) {
        const { data: inserted, error } = await supabase.from("funding_opportunities").insert({
          organization_id: organizationId, canonical_key: item.canonicalKey, source: source.name,
          external_url: item.officialUrl, official_source_id: sourceId, official_url: item.officialUrl,
          title: item.title, organization: item.organization, summary: item.summary, territory: item.territory,
          funding_type: item.fundingType, categories: item.categories, raw_content: item.rawContent,
          max_amount: item.maxAmount ?? null, open_date: item.openDate ?? null, deadline: item.deadline ?? null,
          availability_status: item.availabilityStatus ?? "unknown", expected_open_date: item.expectedOpenDate ?? null,
          funding_rate_max: item.fundingRateMax ?? null, min_eligible_spend: item.minEligibleSpend ?? null,
          private_contribution_min_rate: item.privateContributionMinRate ?? null, stacking_limit_rate: item.stackingLimitRate ?? null,
          intake_start_at: item.intakeStartAt ?? null, intake_end_at: item.intakeEndAt ?? null,
          funding_formula: item.fundingFormula ?? null, government_priorities: item.governmentPriorities ?? [],
          assessment_criteria: item.assessmentCriteria ?? null, official_page_updated_at: item.officialPageUpdatedAt ?? null,
          deep_read_at: item.deepReadAt ?? null,
          preparation_documents: item.preparationDocuments ?? [], preparation_notes: item.preparationNotes ?? null,
          preparation_source_url: item.preparationSourceUrl ?? item.officialUrl,
          target_audience: classification.audience, business_relevance_score: classification.score,
          business_relevance_reason: classification.reason, audience_classified_at: now,
          status: "new", discovered_at: now, last_checked_at: now, last_verified_at: now, source_updated_at: now, updated_at: now,
        }).select("id").single();
        if (error) throw error;
        opportunityId = inserted.id; created += 1;
        const { error: changeError } = await supabase.from("funding_opportunity_changes").insert({ organization_id: organizationId, opportunity_id: opportunityId, source_id: sourceId, change_type: "new_program", summary: `Programme détecté pour la première fois sur ${source.name}.` });
        if (changeError) throw changeError;
      } else {
        opportunityId = existing.id;
        const changed = existing.title !== item.title || existing.official_url !== item.officialUrl;
        const { error } = await supabase.from("funding_opportunities").update({
          title: item.title, external_url: item.officialUrl, official_url: item.officialUrl, official_source_id: sourceId,
          organization: item.organization, funding_type: item.fundingType,
          max_amount: item.maxAmount ?? null, open_date: item.openDate ?? null, deadline: item.deadline ?? null,
          availability_status: item.availabilityStatus ?? "unknown", expected_open_date: item.expectedOpenDate ?? null,
          funding_rate_max: item.fundingRateMax ?? null, min_eligible_spend: item.minEligibleSpend ?? null,
          private_contribution_min_rate: item.privateContributionMinRate ?? null, stacking_limit_rate: item.stackingLimitRate ?? null,
          intake_start_at: item.intakeStartAt ?? null, intake_end_at: item.intakeEndAt ?? null,
          funding_formula: item.fundingFormula ?? null, government_priorities: item.governmentPriorities ?? [],
          assessment_criteria: item.assessmentCriteria ?? null, official_page_updated_at: item.officialPageUpdatedAt ?? null,
          deep_read_at: item.deepReadAt ?? null,
          preparation_documents: item.preparationDocuments ?? [], preparation_notes: item.preparationNotes ?? null,
          preparation_source_url: item.preparationSourceUrl ?? item.officialUrl,
          target_audience: classification.audience, business_relevance_score: classification.score,
          business_relevance_reason: classification.reason, audience_classified_at: now,
          last_checked_at: now, last_verified_at: now, source_updated_at: now, updated_at: now,
        }).eq("id", opportunityId);
        if (error) throw error;
        if (changed) updated += 1;
      }
      const { error: linkError } = await supabase.from("funding_opportunity_sources").upsert({ organization_id: organizationId, opportunity_id: opportunityId, source_id: sourceId, source_url: item.officialUrl, last_detected_at: now, match_status: "confirmed" }, { onConflict: "opportunity_id,source_id,source_url" });
      if (linkError) throw linkError;
      if (item.territory === "Québec") {
        const { data: territory } = await supabase.from("funding_opportunity_territories").select("id").eq("opportunity_id", opportunityId).eq("scope_level", "province_territory").eq("province_territory", "Québec").maybeSingle();
        if (!territory) {
          const { error: territoryError } = await supabase.from("funding_opportunity_territories").insert({ organization_id: organizationId, opportunity_id: opportunityId, scope_level: "province_territory", province_territory: "Québec" });
          if (territoryError) throw territoryError;
        }
      }
    }
    await supabase.from("funding_sources").update({ health_status: "healthy", last_checked_at: now, last_success_at: now, last_error: null, collection_method: "scrape", updated_at: now }).eq("id", sourceId);
    await supabase.from("funding_collection_runs").update({ status: "success", finished_at: now, discovered_count: items.length, created_count: created, updated_count: updated }).eq("id", run.id);
    return { discovered: items.length, created, updated, sourceName: source.name };
  } catch (error) {
    const now = new Date().toISOString(); const message = error instanceof Error ? error.message : "Erreur inconnue";
    await supabase.from("funding_sources").update({ health_status: "error", last_checked_at: now, last_error: message, updated_at: now }).eq("id", sourceId);
    await supabase.from("funding_collection_runs").update({ status: "error", finished_at: now, error_message: message }).eq("id", run.id);
    return { discovered: 0, created: 0, updated: 0, sourceName: source.name, error: message };
  }
}

export async function runBusinessFundingCollections(supabase: Client, organizationId: string) {
  await ensurePrioritySources(supabase, organizationId);
  const results: CollectionSummary[] = [];
  results.push(await runConnector(supabase, organizationId, { ...QUEBEC_SOURCE, isOfficial: true }, collectQuebecFinancialAid));
  results.push(await runConnector(supabase, organizationId, { ...INVEST_QUEBEC_SOURCE, isOfficial: true }, collectInvestQuebecPrograms));
  results.push(await runConnector(supabase, organizationId, PSCE_SOURCE, collectPsce));
  for (const connector of PRIORITY_EMPLOYMENT_CONNECTORS) {
    results.push(await runConnector(supabase, organizationId, connector.source, connector.collect));
  }
  return results;
}
