// Compatibilité « besoins du client » -> programmes ajoutés (grant_programs).
//
// Réutilise le moteur de la veille (features/watch/projectMatch.ts) : mêmes 6 facteurs, mêmes
// raisons explicables. Deux adaptations propres aux programmes lus depuis une page :
//  1. le texte intégral de la page (source_text, jusqu'à 50 000 caractères) n'entre PAS dans la
//     comparaison thématique : n'importe quel mot courant y ferait « correspondre » presque tout.
//     On compare aux champs qui décrivent le programme (nom, description, dépenses admissibles,
//     priorités) ;
//  2. un programme n'est proposé que s'il partage au moins un univers métier avec le besoin
//     (ex. « Export / international » pour un programme de commercialisation) ou, à défaut,
//     au moins 2 mots significatifs entiers. La recherche lexicale de la veille n'est pas utilisée
//     comme filtre : elle compte des sous-chaînes (« ia » dans « commercialisation »).
import { assessRelevance, buildNeedProfile } from "@/features/watch/relevance";
import {
  extractProjectSignals,
  scoreOpportunityForProject,
  type FundingAwardForMatch,
  type OpportunityForMatch,
  type ProjectMatchResult,
} from "@/features/watch/projectMatch";
import type { ProgramRow } from "@/server/repositories/programs.repository";
import type { ProgramExampleRow } from "@/server/repositories/programExamples.repository";

const MIN_SCORE = 35;
function splitList(text: string | null): string[] {
  return (text ?? "").split(/\n|;|•/).map((s) => s.replace(/^[-\s]+/, "").trim()).filter(Boolean);
}

// Le champ territoire est du texte libre (« Québec, toutes régions »...) alors que le moteur
// compare des valeurs exactes : on ramène à « Québec » / « Canada » ou à null (non restrictif).
function normalizeTerritory(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/qu[ée]bec/.test(t)) return "Québec";
  if (/canada|f[ée]d[ée]ral|national|pancanadien/.test(t)) return "Canada";
  return null;
}

export function programToOpportunity(p: ProgramRow): OpportunityForMatch {
  const focus = [p.description, p.aid_notes, p.government_priorities.join(", ")].filter(Boolean).join(". ");
  return {
    id: p.id,
    title: p.name,
    summary: focus || null,
    organization: p.agency,
    eligible_expenses: splitList(p.eligible_expenses),
    eligibility_criteria: null,
    raw_content: null, // voir (1) ci-dessus
    funding_type: null,
    territory: normalizeTerritory(p.territory),
    max_amount: p.max_aid_amount,
    min_eligible_spend: p.min_eligible_spend,
    funding_rate_max: p.typical_aid_rate == null ? null : Math.round(p.typical_aid_rate * 10000) / 100,
    deadline: p.deadline,
    availability_status: p.availability_status,
    expected_open_date: p.availability_status === "opening_soon" ? p.open_date : null,
    government_priorities: p.government_priorities,
    assessment_criteria: null,
  };
}

export type ProgramMatch = {
  program: ProgramRow;
  result: ProjectMatchResult;
  sharedThemes: string[];
};

export function matchNeedsToPrograms(
  needsText: string,
  programs: ProgramRow[],
  examples: ProgramExampleRow[],
  limit = 5
): { matches: ProgramMatch[]; hiddenCount: number; needThemes: string[] } {
  const text = needsText.trim();
  if (!text) return { matches: [], hiddenCount: 0, needThemes: [] };

  const signals = extractProjectSignals(text);
  const profile = buildNeedProfile(text);
  const needThemes = profile.themes;

  const awardsByProgram = new Map<string, FundingAwardForMatch[]>();
  for (const e of examples) {
    const list = awardsByProgram.get(e.program_id) ?? [];
    list.push({ id: e.id, recipient_name: e.recipient_name, project_title: e.title, description: e.description, amount: e.amount, location: e.location });
    awardsByProgram.set(e.program_id, list);
  }

  const all: ProgramMatch[] = [];
  for (const program of programs) {
    const opportunity = programToOpportunity(program);
    const { relevant, sharedThemes } = assessRelevance(
      profile,
      [program.name, program.description, program.program_type, program.eligible_expenses, program.government_priorities.join(" ")].filter(Boolean).join(" ")
    );
    if (!relevant) continue;
    all.push({ program, result: scoreOpportunityForProject(signals, opportunity, awardsByProgram.get(program.id) ?? []), sharedThemes });
  }

  all.sort((a, b) => b.result.score - a.result.score);
  const relevant = all.filter((m) => m.result.score >= MIN_SCORE);
  return { matches: relevant.slice(0, limit), hiddenCount: Math.max(0, relevant.length - limit), needThemes };
}
