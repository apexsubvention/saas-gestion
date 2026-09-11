import type { CollectedOpportunity } from "./quebec";
import { enrichOfficialOpportunity } from "./officialPageEnrichment";

const ROOT = "https://www.investquebec.com";
const LIST_URL = `${ROOT}/fr/financement/programmes-gouvernementaux`;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç")
    .replace(/&rsquo;|&#8217;/g, "’");
}

function textOnly(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function absoluteUrl(href: string) {
  return href.startsWith("http")
    ? href
    : new URL(href, ROOT).toString();
}

function keyFromUrl(url: string) {
  return `iq:${new URL(url).pathname
    .replace(/\/$/, "")
    .toLowerCase()}`;
}

function inferType(
  title: string
): CollectedOpportunity["fundingType"] {
  const t = title.toLowerCase();

  if (
    t.includes("crédit d'impôt") ||
    t.includes("crédit d’impôt")
  ) {
    return "tax_credit";
  }

  if (t.includes("contribution")) {
    return "contribution";
  }

  if (
    t.includes("prêt") ||
    t.includes("garantie")
  ) {
    return "loan";
  }

  if (t.includes("capital")) {
    return "equity";
  }

  return "financing";
}

export async function collectInvestQuebecPrograms(): Promise<
  CollectedOpportunity[]
> {
  const response = await fetch(LIST_URL, {
    cache: "no-store",
    headers: {
      "User-Agent": "ApexFundingWatch/1.1",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Investissement Québec a répondu HTTP ${response.status}`
    );
  }

  const html = await response.text();

  if (html.length < 1000) {
    throw new Error(
      "Réponse Investissement Québec vide ou inattendue."
    );
  }

  const results = new Map<
    string,
    CollectedOpportunity
  >();

  const anchor =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchor.exec(html)) !== null) {
    const rawHref = match[1];
    const rawTitle = match[2];

    if (!rawHref || !rawTitle) {
      continue;
    }

    const href = decodeHtml(rawHref);

    if (
      !href
        .toLowerCase()
        .includes(
          "/fr/financement/programmes-gouvernementaux/"
        )
    ) {
      continue;
    }

    const title = textOnly(rawTitle);

    if (
      title.length < 8 ||
      title.length > 240
    ) {
      continue;
    }

    const cleanHref = href.split("#")[0];

    if (!cleanHref) {
      continue;
    }

    const url = absoluteUrl(cleanHref);
    const canonicalKey = keyFromUrl(url);

    if (results.has(canonicalKey)) {
      continue;
    }

    results.set(canonicalKey, {
      canonicalKey,
      title,
      summary: null,
      officialUrl: url,
      organization: "Investissement Québec",
      territory: "Québec",
      fundingType: inferType(title),
      categories: ["Entreprise"],
      rawContent: title,
    });
  }

  if (results.size === 0) {
    throw new Error(
      "Apex n’a trouvé aucun programme sur Investissement Québec. Le format de la source a peut-être changé."
    );
  }

  // Lecture détaillée des fiches officielles IQ.
  // On travaille par petits lots pour éviter de
  // surcharger la source tout en capturant les
  // dates, taux, maximums et priorités.
  const baseItems = [...results.values()];
  const enriched: CollectedOpportunity[] = [];
  const chunkSize = 5;

  for (
    let i = 0;
    i < baseItems.length;
    i += chunkSize
  ) {
    const chunk = baseItems.slice(
      i,
      i + chunkSize
    );

    const detailed = await Promise.all(
      chunk.map(async (item) => {
        try {
          return await enrichOfficialOpportunity(
            item
          );
        } catch {
          return item;
        }
      })
    );

    enriched.push(...detailed);
  }

  return enriched;
}

export const INVEST_QUEBEC_SOURCE = {
  name: "Investissement Québec",
  baseUrl: LIST_URL,
  sourceFamily: "crown_corporation" as const,
  geographicLevel:
    "province_territory" as const,
  territoryLabel: "Québec",
};