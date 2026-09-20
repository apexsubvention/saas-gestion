// Orchestrateur : URL -> page principale + quelques pages liées -> champs structurés.
//
// Ne lève jamais : toute erreur est renvoyée dans le résultat (status/error) pour que la
// création du programme ne dépende pas de la disponibilité du site lu ni de l'API.
import { extractLinks, extractMetaDescription, extractTitle, htmlToStructuredText, type PageLink } from "./html";
import { fetchPublicPage, UnsafeUrlError } from "./safeFetch";
import { candidateResourceLinks, pickRelatedPages } from "./links";
import { heuristicExtract } from "./heuristic";
import { extractWithClaude, llmAvailable, type LlmLink, type LlmPage } from "./llm";
import { emptyExtraction, type ProgramExtraction, type ProgramReadResult, type ResourceLink } from "./types";

const MAIN_TEXT_LIMIT = 45_000;
const SUBPAGE_TEXT_LIMIT = 12_000;
const STORED_TEXT_LIMIT = 50_000;

function errorMessage(e: unknown) {
  if (e instanceof UnsafeUrlError) return e.message;
  if (e instanceof Error) return e.name === "TimeoutError" || e.name === "AbortError" ? "Délai dépassé en lisant la page." : e.message;
  return String(e);
}

// Complète `primary` avec `fallback` champ par champ (le primaire gagne quand il a une valeur).
function mergeExtractions(primary: ProgramExtraction, fallback: ProgramExtraction): ProgramExtraction {
  const out = { ...fallback, ...primary } as ProgramExtraction;
  for (const key of Object.keys(primary) as Array<keyof ProgramExtraction>) {
    const p = primary[key];
    const empty = p == null || (Array.isArray(p) && p.length === 0);
    if (empty) (out as Record<string, unknown>)[key] = fallback[key];
  }
  return out;
}

// Une date limite dépassée ne peut pas correspondre à un programme « ouvert ».
function reconcileAvailability(fields: ProgramExtraction, today = new Date().toISOString().slice(0, 10)) {
  if (fields.deadline && fields.deadline < today && (fields.availability_status === "open" || fields.availability_status == null)) {
    fields.availability_status = "closed";
  }
  return fields;
}

const hasUsefulData = (f: ProgramExtraction) =>
  [f.aid_rate, f.max_aid_amount, f.deadline, f.open_date, f.min_eligible_spend, f.eligible_expenses, f.claim_process, f.application_process].some((v) => v != null) ||
  f.required_documents.length > 0;

export async function readProgramFromUrl(rawUrl: string): Promise<ProgramReadResult> {
  const failed = (error: string): ProgramReadResult => ({
    status: "error", method: null, error, fields: emptyExtraction(), resourceLinks: [], examples: [], sourceText: null, pagesRead: [],
  });

  let mainUrl: string;
  let mainHtml: string;
  try {
    const main = await fetchPublicPage(rawUrl);
    mainUrl = main.url;
    mainHtml = main.html;
  } catch (e) {
    return failed(errorMessage(e));
  }

  const links: PageLink[] = extractLinks(mainHtml, mainUrl);
  const mainText = htmlToStructuredText(mainHtml);
  if (mainText.length < 200) {
    return failed("La page ne contient presque pas de texte lisible (contenu chargé dynamiquement ou protégé ?).");
  }

  // Pages liées (exemples, réclamation, admissibilité...) : lues en parallèle, les échecs sont ignorés.
  const related = pickRelatedPages(links, mainUrl);
  const settled = await Promise.allSettled(related.map((l) => fetchPublicPage(l.url)));
  const subPages: Array<{ url: string; text: string; links: PageLink[] }> = [];
  settled.forEach((s) => {
    if (s.status !== "fulfilled") return;
    const text = htmlToStructuredText(s.value.html);
    if (text.length >= 200) subPages.push({ url: s.value.url, text, links: extractLinks(s.value.html, s.value.url) });
  });

  const pages: LlmPage[] = [
    { id: 0, url: mainUrl, text: mainText.slice(0, MAIN_TEXT_LIMIT) },
    ...subPages.map((p, i) => ({ id: i + 1, url: p.url, text: p.text.slice(0, SUBPAGE_TEXT_LIMIT) })),
  ];
  const allLinks = [...links, ...subPages.flatMap((p) => p.links)];
  const candidates = candidateResourceLinks(allLinks);
  const llmLinks: LlmLink[] = candidates.map((c, i) => ({ id: i, url: c.url, label: c.label }));

  const heuristic = heuristicExtract(mainText, extractTitle(mainHtml), extractMetaDescription(mainHtml));
  const sourceText = pages.map((p) => p.text).join("\n\n---\n\n").slice(0, STORED_TEXT_LIMIT);
  const pagesRead = pages.map((p) => p.url);

  // Repli sur les liens détectés par mots-clés quand l'IA n'est pas utilisée.
  const heuristicLinks: ResourceLink[] = candidates.slice(0, 12).map((c) => ({ label: c.label, url: c.url, kind: c.kind }));

  let llmError: string | null = null;
  if (llmAvailable()) {
    try {
      const llm = await extractWithClaude(pages, llmLinks);
      if (llm) {
        const fields = reconcileAvailability(mergeExtractions(llm.fields, heuristic));
        return {
          status: hasUsefulData(fields) ? "ok" : "partial",
          method: "llm",
          error: hasUsefulData(fields) ? null : "La page a été lue mais peu d'informations chiffrées en ont été extraites : à compléter à la main.",
          fields,
          resourceLinks: llm.resourceLinks.length ? llm.resourceLinks : heuristicLinks,
          examples: llm.examples,
          sourceText,
          pagesRead,
        };
      }
    } catch (e) {
      llmError = `Lecture par IA indisponible (${errorMessage(e)}) : résultats de l'extraction automatique simple, à vérifier.`;
    }
  } else {
    llmError = "Lecture par IA non configurée (ANTHROPIC_API_KEY absente) : extraction automatique simple, beaucoup de champs peuvent rester vides.";
  }

  const fields = reconcileAvailability(heuristic);
  return {
    status: "partial",
    method: "heuristic",
    error: llmError,
    fields,
    resourceLinks: heuristicLinks,
    examples: [],
    sourceText,
    pagesRead,
  };
}
