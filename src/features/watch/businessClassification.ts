export type Audience = "private_business" | "mixed" | "nonprofit" | "municipality" | "individual" | "public_body" | "unknown";

const STRONG_BUSINESS = [
  "entreprise", "entreprises", "pme", "employeur", "employeurs", "productivité", "productivite",
  "export", "exportation", "innovation", "commercialisation", "transformation numérique", "transformation numerique",
  "technologie", "investissement", "manufacturier", "manufacturière", "croissance", "automatisation", "logiciel",
  "équipement", "equipement", "main-d’œuvre", "main-d'oeuvre", "embauche", "formation des employés", "formation des employes",
];
const NONPROFIT = ["corporation de développement communautaire", "organisme communautaire", "action communautaire", "lutte contre la pauvreté", "obnl", "organismes à but non lucratif"];
const MUNICIPAL = ["municipalité", "municipalite", "municipalités", "municipalites", "infrastructure municipale", "administration municipale"];
const INDIVIDUAL = ["particulier", "particuliers", "citoyen", "citoyens", "ménage", "menage", "personnes à faible revenu", "personnes a faible revenu"];

export function classifyBusinessAudience(input: { title: string; summary?: string | null; rawContent?: string | null }) {
  const text = `${input.title} ${input.summary ?? ""} ${input.rawContent ?? ""}`.toLowerCase();
  if (NONPROFIT.some((term) => text.includes(term))) return { audience: "nonprofit" as const, score: 10, reason: "Programme principalement communautaire / OBNL." };
  if (MUNICIPAL.some((term) => text.includes(term))) return { audience: "municipality" as const, score: 10, reason: "Programme principalement municipal." };
  if (INDIVIDUAL.some((term) => text.includes(term))) return { audience: "individual" as const, score: 5, reason: "Programme principalement destiné aux particuliers." };
  const hits = STRONG_BUSINESS.filter((term) => text.includes(term)).length;
  if (hits >= 2) return { audience: "private_business" as const, score: Math.min(98, 78 + hits * 4), reason: "Plusieurs indices indiquent une aide destinée aux entreprises." };
  if (hits === 1) return { audience: "mixed" as const, score: 65, reason: "Au moins un indice entreprise est présent; admissibilité à confirmer." };
  return { audience: "unknown" as const, score: 45, reason: "Public cible non déterminé automatiquement." };
}
