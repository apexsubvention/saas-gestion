// Filtre de pertinence « ce programme parle-t-il de la même chose que le besoin ? ».
//
// Pourquoi ce filtre : le moteur de correspondance (projectMatch.ts) donne un score de base non
// nul à TOUT programme (les facteurs sans information valent 50 %), et la recherche lexicale
// compte des sous-chaînes (« ia » dans « stagiaires ») sur le texte intégral des pages. Sans
// filtre, chaque programme « correspond » à peu près à n'importe quel besoin, et « aucun
// résultat » n'arrive jamais -- donc la recherche web de secours ne se déclenche jamais.
//
// Règle : un programme est pertinent s'il partage avec le besoin, dans les champs qui LE DÉCRIVENT
// (nom, description, dépenses admissibles, priorités... pas le texte intégral de la page) :
//   - au moins un univers métier (mots entiers, cf. matchedIntentGroupsStrict), ou
//   - au moins 2 mots significatifs entiers.
import { matchedIntentGroupsStrict, normalizeSearchText } from "./search";

const MIN_SHARED_KEYWORDS = 2;

// Mots trop génériques pour prouver que deux textes parlent de la même chose.
const GENERIC_WORDS = new Set([
  "client", "clients", "projet", "projets", "entreprise", "entreprises", "besoin", "besoins", "veut", "voudrait",
  "souhaite", "aide", "aides", "programme", "programmes", "subvention", "subventions", "financement", "financer",
  "developper", "developpement", "nouveau", "nouveaux", "nouvelle", "nouvelles", "pour", "avec", "dans", "leur",
  "leurs", "notre", "quebec", "canada", "depenses", "admissibles", "admissible", "soutien", "mettre", "faire",
  "avoir", "etre", "cherche", "chercher", "recherche", "trouver", "obtenir", "demande", "demander", "organiser",
  "realiser", "societe", "organisme", "organismes",
]);

function keywordStem(word: string) {
  return word.replace(/(es|s|x)$/, "");
}

export function significantKeywords(text: string): Set<string> {
  return new Set(
    normalizeSearchText(text)
      .split(" ")
      .filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w))
      .map(keywordStem)
  );
}

export type NeedProfile = { text: string; themes: string[]; keywords: Set<string> };

export function buildNeedProfile(text: string): NeedProfile {
  const trimmed = text.trim();
  return { text: trimmed, themes: matchedIntentGroupsStrict(trimmed), keywords: significantKeywords(trimmed) };
}

export type RelevanceResult = { relevant: boolean; sharedThemes: string[]; sharedKeywords: string[] };

/** `focusText` : uniquement ce qui décrit le programme, jamais le texte intégral de sa page. */
export function assessRelevance(profile: NeedProfile, focusText: string): RelevanceResult {
  if (!profile.text) return { relevant: false, sharedThemes: [], sharedKeywords: [] };
  const programThemes = matchedIntentGroupsStrict(focusText);
  const programKeywords = significantKeywords(focusText);
  const sharedThemes = profile.themes.filter((t) => programThemes.includes(t));
  const sharedKeywords = [...profile.keywords].filter((w) => programKeywords.has(w));
  return { relevant: sharedThemes.length > 0 || sharedKeywords.length >= MIN_SHARED_KEYWORDS, sharedThemes, sharedKeywords };
}
