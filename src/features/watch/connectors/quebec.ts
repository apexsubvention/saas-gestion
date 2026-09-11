export type CollectedOpportunity = {
  canonicalKey: string;
  title: string;
  summary: string | null;
  officialUrl: string;
  organization: string;
  territory: string;
  fundingType:
    | "grant"
    | "contribution"
    | "loan"
    | "financing"
    | "wage_subsidy"
    | "internship"
    | "call_for_projects"
    | "tax_credit"
    | "tax_incentive"
    | "equity"
    | "advisory"
    | "other";
  categories: string[];
  rawContent: string;
  maxAmount?: number | null;
  openDate?: string | null;
  deadline?: string | null;
  availabilityStatus?:
    | "open"
    | "opening_soon"
    | "continuous"
    | "closed"
    | "unknown";
  expectedOpenDate?: string | null;
  preparationDocuments?: string[];
  preparationNotes?: string | null;
  preparationSourceUrl?: string | null;
  fundingRateMax?: number | null;
  minEligibleSpend?: number | null;
  privateContributionMinRate?: number | null;
  stackingLimitRate?: number | null;
  intakeStartAt?: string | null;
  intakeEndAt?: string | null;
  fundingFormula?: string | null;
  governmentPriorities?: string[];
  assessmentCriteria?: string | null;
  officialPageUpdatedAt?: string | null;
  deepReadAt?: string | null;
};

const ROOT = "https://www.quebec.ca";

const LIST_URL =
  `${ROOT}/entreprises-et-travailleurs-autonomes/` +
  "liste-partielle-aide-financiere";

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&agrave;/g, "à")
    .replace(/&Agrave;/g, "À")
    .replace(/&ccedil;/g, "ç")
    .replace(/&ocirc;/g, "ô")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&#x27;/g, "'");
}

function textOnly(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function absoluteUrl(href: string) {
  if (
    href.startsWith("http://") ||
    href.startsWith("https://")
  ) {
    return href;
  }

  return new URL(href, ROOT).toString();
}

function keyFromUrl(url: string) {
  const pathname = new URL(url).pathname
    .replace(/\/$/, "")
    .toLowerCase();

  return `quebec:${pathname}`;
}

function inferType(
  title: string,
): CollectedOpportunity["fundingType"] {
  const normalized = title.toLowerCase();

  if (
    normalized.includes("crédit d’impôt") ||
    normalized.includes("crédit d'impôt")
  ) {
    return "tax_credit";
  }

  if (
    normalized.includes("exonération") ||
    normalized.includes("incitatif fiscal")
  ) {
    return "tax_incentive";
  }

  if (
    normalized.includes("subvention salariale") ||
    normalized.includes("embauche")
  ) {
    return "wage_subsidy";
  }

  if (
    normalized.includes("stage") ||
    normalized.includes("stagiaire")
  ) {
    return "internship";
  }

  if (
    normalized.includes("appel de projets") ||
    normalized.includes("appel à projets") ||
    normalized.includes("appel à propositions")
  ) {
    return "call_for_projects";
  }

  if (
    normalized.includes("prêt") ||
    normalized.includes("garantie de prêt")
  ) {
    return "loan";
  }

  if (normalized.includes("capital")) {
    return "equity";
  }

  if (
    normalized.includes("conseil") ||
    normalized.includes("mentorat")
  ) {
    return "advisory";
  }

  if (
    normalized.includes("contribution")
  ) {
    return "contribution";
  }

  if (
    normalized.includes("financement")
  ) {
    return "financing";
  }

  return "grant";
}

function isLikelyProgramLink(href: string) {
  return href.includes(
    "/entreprises-et-travailleurs-autonomes/" +
      "liste-partielle-aide-financiere/",
  );
}

function cleanAnchorHref(href: string) {
  const withoutHash = href.split("#")[0];

  return withoutHash ?? href;
}

export async function collectQuebecFinancialAid(): Promise<
  CollectedOpportunity[]
> {
  const response = await fetch(LIST_URL, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "ApexFundingWatch/1.0 " +
        "(+business funding monitoring; contact via application owner)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Québec.ca a répondu HTTP ${response.status}`,
    );
  }

  const html = await response.text();

  if (html.length < 1000) {
    throw new Error(
      "Réponse Québec.ca vide ou inattendue.",
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

    if (!isLikelyProgramLink(href)) {
      continue;
    }

    const title = textOnly(rawTitle);

    if (
      title.length < 8 ||
      title.length > 240
    ) {
      continue;
    }

    const cleanedHref =
      cleanAnchorHref(href);

    const url =
      absoluteUrl(cleanedHref);

    const canonicalKey =
      keyFromUrl(url);

    if (results.has(canonicalKey)) {
      continue;
    }

    results.set(canonicalKey, {
      canonicalKey,
      title,
      summary: null,
      officialUrl: url,
      organization:
        "Gouvernement du Québec",
      territory: "Québec",
      fundingType:
        inferType(title),
      categories: [],
      rawContent: title,
    });
  }

  if (results.size === 0) {
    throw new Error(
      "Apex n’a trouvé aucun lien de programme " +
        "dans la page officielle Québec.ca. " +
        "Le format de la source a peut-être changé; " +
        "aucune donnée n’a été inventée.",
    );
  }

  return [...results.values()];
}

export const QUEBEC_SOURCE = {
  name:
    "Québec.ca — Liste des aides financières",
  baseUrl: LIST_URL,
  sourceFamily:
    "official_provincial_portal" as const,
  geographicLevel:
    "province_territory" as const,
  territoryLabel: "Québec",
};