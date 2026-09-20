// Extraction sans IA : réutilise les extracteurs regex de la veille (officialPageEnrichment),
// calibrés sur les pages Québec.ca / Investissement Québec / Canada.ca. Volontairement prudente :
// un champ non reconnu reste null plutôt que deviné.
import {
  extractFrenchDate,
  extractFrenchDateTimeRange,
  extractMaxAmount,
  extractMaxRate,
  extractMinEligibleSpend,
  extractPriorities,
  inferAvailability,
} from "@/features/watch/connectors/officialPageEnrichment";
import { emptyExtraction, type ProgramExtraction } from "./types";

export function heuristicExtract(text: string, title: string | null, metaDescription: string | null): ProgramExtraction {
  const out = emptyExtraction();
  const range = extractFrenchDateTimeRange(text);

  out.name = title;
  out.description = metaDescription;
  out.max_aid_amount = extractMaxAmount(text);
  const rate = extractMaxRate(text);
  out.aid_rate = rate == null ? null : Math.min(1, Math.max(0, rate / 100));
  out.min_eligible_spend = extractMinEligibleSpend(text);
  out.open_date = range?.startDate ?? extractFrenchDate(text, /(ouverture|début|à partir de)/i);
  out.deadline = range?.endDate ?? extractFrenchDate(text, /(échéance|date limite|jusqu['’]au|fermeture)/i);
  const availability = inferAvailability(text, range);
  out.availability_status = availability === "unknown" ? null : availability;
  out.government_priorities = extractPriorities(text);
  return out;
}
