export const FUNDING_TYPE_OPTIONS = [
  ["grant", "Subvention"],
  ["contribution", "Contribution"],
  ["loan", "Prêt"],
  ["financing", "Financement"],
  ["wage_subsidy", "Subvention salariale"],
  ["internship", "Stage"],
  ["call_for_projects", "Appel de projets / propositions"],
  ["tax_credit", "Crédit d'impôt"],
  ["tax_incentive", "Incitatif fiscal"],
  ["equity", "Capital"],
  ["advisory", "Accompagnement"],
  ["other", "Autre"],
] as const;

export const SOURCE_FAMILY_OPTIONS = [
  ["official_federal_aggregator", "Agrégateur officiel Canada"],
  ["official_provincial_portal", "Portail provincial / territorial"],
  ["federal_ministry", "Ministère fédéral"],
  ["federal_regional_agency", "Agence fédérale régionale"],
  ["provincial_ministry", "Ministère provincial"],
  ["crown_corporation", "Société d'État"],
  ["funding_intermediary", "Organisme mandataire / distributeur"],
  ["regional_local_org", "MRC / SADC / CAE / développement régional"],
  ["municipality", "Municipalité"],
  ["private_aggregator", "Agrégateur privé"],
  ["other", "Autre"],
] as const;

export const GEOGRAPHIC_LEVEL_OPTIONS = [
  ["canada", "Canada"],
  ["province_territory", "Province / territoire"],
  ["region", "Région"],
  ["mrc_equivalent", "MRC / équivalent"],
  ["municipality", "Municipalité"],
  ["national_specialized", "National spécialisé"],
  ["other", "Autre"],
] as const;

export const SOURCE_HEALTH_LABELS: Record<string, string> = {
  never_checked: "Jamais vérifiée",
  healthy: "OK",
  warning: "Attention",
  error: "Erreur",
  disabled: "Désactivée",
};

export const WATCH_STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  to_review: "À analyser",
  qualified: "Pertinent",
  ignored: "Ignoré",
  archived: "Archivé",
};

export const FUNDING_TYPE_LABELS = Object.fromEntries(FUNDING_TYPE_OPTIONS) as Record<string, string>;
export const SOURCE_FAMILY_LABELS = Object.fromEntries(SOURCE_FAMILY_OPTIONS) as Record<string, string>;
