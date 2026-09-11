import type { CollectedOpportunity } from "./quebec";
import { enrichOfficialOpportunity } from "./officialPageEnrichment";

const PSCE_URL = "https://www.investquebec.com/fr/financement/programmes-gouvernementaux/programme-de-soutien-la-commercialisation-et-lexportation/psce-volet-2";

export async function collectPsce(): Promise<CollectedOpportunity[]> {
  const base: CollectedOpportunity = {
    canonicalKey: "iq:/fr/financement/programmes-gouvernementaux/programme-de-soutien-la-commercialisation-et-lexportation/psce-volet-2",
    title: "PSCE — Volet 2 — Diversification et consolidation sur les marchés hors Québec",
    summary: "Favoriser la réalisation de projets de diversification et de consolidation de marchés hors Québec.",
    officialUrl: PSCE_URL,
    organization: "Investissement Québec",
    territory: "Québec",
    fundingType: "contribution",
    categories: ["Exportation", "Commercialisation", "Développement de marchés"],
    rawContent: "PSCE volet 2",
    maxAmount: 60000,
    fundingRateMax: 50,
    minEligibleSpend: 50000,
    privateContributionMinRate: 35,
    stackingLimitRate: 65,
    availabilityStatus: "opening_soon",
    expectedOpenDate: "2026-09-17",
    openDate: "2026-09-17",
    deadline: "2026-10-01",
    intakeStartAt: "2026-09-17T12:00:00-04:00",
    intakeEndAt: "2026-10-01T12:00:00-04:00",
    fundingFormula: "Contribution financière non remboursable. Maximum 60 000 $ par entreprise par année. Taux maximal : 50 % pour un premier projet et 40 % pour un deuxième projet. Dépenses admissibles minimales : 50 000 $ pour une première demande, 62 500 $ pour une deuxième et 100 000 $ pour les demandes subséquentes. Apport privé minimal : 35 %. Cumul gouvernemental maximal : 65 %.",
    governmentPriorities: ["Diversification des exportations", "Consolidation de marchés hors Québec", "Amérique latine", "Asie-Pacifique", "Moyen-Orient", "Océanie"],
    assessmentCriteria: "Démontrer une stratégie crédible de diversification ou de consolidation de marchés hors Québec, la capacité de réaliser le projet et le respect des dépenses admissibles du volet.",
    officialPageUpdatedAt: "Mis à jour le 29 juin 2026",
    preparationDocuments: [
      "Formulaire de demande d’aide financière complété",
      "Plan du projet et de la stratégie à l’exportation",
      "États financiers des deux dernières années (ou prévisionnels si applicable)",
      "Offres de service et partenariats, le cas échéant",
      "Curriculum vitæ de la personne embauchée, si applicable",
      "Preuve de conformité aux exigences de francisation, si applicable",
      "Déclaration de conformité au Programme d’accès à l’égalité en emploi, si applicable",
      "Documents justificatifs additionnels selon les dépenses prévues",
    ],
    preparationNotes: "Les pièces exactes dépendent de la nature du projet et des dépenses. Toujours vérifier la fiche et le guide officiels au moment du dépôt.",
    preparationSourceUrl: PSCE_URL,
  };

  try {
    const enriched = await enrichOfficialOpportunity(base);
    return [{
      ...base,
      ...enriched,
      // Les valeurs explicitement publiées du volet 2 restent prioritaires si le parseur générique ne les retrouve pas.
      maxAmount: enriched.maxAmount ?? base.maxAmount,
      fundingRateMax: enriched.fundingRateMax ?? base.fundingRateMax,
      minEligibleSpend: enriched.minEligibleSpend ?? base.minEligibleSpend,
      privateContributionMinRate: enriched.privateContributionMinRate ?? base.privateContributionMinRate,
      stackingLimitRate: enriched.stackingLimitRate ?? base.stackingLimitRate,
      intakeStartAt: enriched.intakeStartAt ?? base.intakeStartAt,
      intakeEndAt: enriched.intakeEndAt ?? base.intakeEndAt,
      expectedOpenDate: enriched.expectedOpenDate ?? base.expectedOpenDate,
      openDate: enriched.openDate ?? base.openDate,
      deadline: enriched.deadline ?? base.deadline,
      availabilityStatus: enriched.availabilityStatus === "unknown" ? base.availabilityStatus : enriched.availabilityStatus,
      fundingFormula: base.fundingFormula,
      governmentPriorities: Array.from(new Set([...(base.governmentPriorities ?? []), ...(enriched.governmentPriorities ?? [])])),
      assessmentCriteria: base.assessmentCriteria,
    }];
  } catch {
    return [base];
  }
}

export const PSCE_SOURCE = {
  name: "Investissement Québec — PSCE Volet 2",
  baseUrl: PSCE_URL,
  sourceFamily: "crown_corporation" as const,
  geographicLevel: "province_territory" as const,
  territoryLabel: "Québec",
  isOfficial: true,
};
