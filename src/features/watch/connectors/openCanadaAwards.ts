export type OpenCanadaAward = {
  programName: string | null;
  recipientName: string | null;
  recipientType: string | null;
  projectTitle: string | null;
  description: string | null;
  amount: number | null;
  agreementStartDate: string | null;
  agreementEndDate: string | null;
  location: string | null;
  federalOrganization: string | null;
  agreementNumber: string | null;
  sourceUrl: string;
  rawContent: string;
};

const ROOT = "https://search.open.canada.ca";

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&rsquo;|&#8217;/gi, "’");
}

function textOnly(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function label(
  text: string,
  name: string,
  nextLabels: string[],
) {
  const escaped = name.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const next = nextLabels
    .map((value) =>
      value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      ),
    )
    .join("|");

  const re = new RegExp(
    `${escaped}:\\s*(.*?)(?=\\s+(?:${next}):|$)`,
    "i",
  );

  return text.match(re)?.[1]?.trim() ?? null;
}

function parseMoney(value: string | null) {
  if (!value) return null;

  const number = Number(
    value.replace(/[$,\s]/g, ""),
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function parseEnglishDate(
  value: string | null,
) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().slice(0, 10);
}

function parseAgreementDates(
  value: string | null,
) {
  if (!value) {
    return {
      start: null,
      end: null,
    };
  }

  const parts = value.split(/\s+-\s+/);

  const startRaw = parts[0];
  const endRaw = parts[1];

  return {
    start: startRaw
      ? parseEnglishDate(startRaw)
      : null,
    end: endRaw
      ? parseEnglishDate(endRaw)
      : null,
  };
}

// Organisme fédéral (owner_org de search.open.canada.ca) associé à chaque programme connu.
// Sans ce mappage, la recherche interrogeait toujours nrc-cnrc (PARI) quel que soit le
// programme demandé : CanExport ne pouvait donc jamais remonter d'exemple, même si
// matchesProgram() sait reconnaître le mot "canexport" dans un résultat.
// Valeur "dfatd-maecd" vérifiée le 18 sept. 2026 via une recherche indexée réelle
// (search.open.canada.ca/grants/?owner_org=dfatd-maecd renvoie des ententes Affaires
// mondiales Canada / Global Affairs Canada, dont des ententes CanExport).
const OWNER_ORG_BY_PROGRAM: Array<{ pattern: RegExp; ownerOrg: string }> = [
  { pattern: /pari|irap|industrial research assistance|nrc[- ]cnrc|conseil national de recherches/i, ownerOrg: "nrc-cnrc" },
  { pattern: /canexport|affaires mondiales|global affairs/i, ownerOrg: "dfatd-maecd" },
];

// Organisme fédéral à interroger pour un programme donné, ou null si inconnu
// (dans ce cas la recherche ne filtre pas par owner_org et matchesProgram() fait le tri).
export function resolveOwnerOrg(programHint: string): string | null {
  const match = OWNER_ORG_BY_PROGRAM.find((entry) => entry.pattern.test(programHint));
  return match?.ownerOrg ?? null;
}

// À utiliser côté UI pour savoir si "Exemples de projets déjà financés" a une chance de
// trouver quelque chose, plutôt que de dupliquer une regex qui peut diverger de ce mappage.
export function supportsOpenCanadaAwards(programHint: string) {
  return resolveOwnerOrg(programHint) !== null;
}

async function recordUrls(page: number, ownerOrg: string | null) {
  const ownerOrgParam = ownerOrg ? `&owner_org=${encodeURIComponent(ownerOrg)}` : "";
  const url =
    `${ROOT}/grants/?page=${page}` +
    ownerOrgParam +
    `&sort=agreement_start_date+desc` +
    `&wbdisable=false`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "ApexFundingWatch/1.4",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    return [] as string[];
  }

  const html = await response.text();

  const found = new Set<string>();

  for (const match of html.matchAll(
    /href=["']([^"']*\/grants\/record\/[^"']+)["']/gi,
  )) {
    const rawHref = match[1];

    if (!rawHref) {
      continue;
    }

    const href = decodeHtml(rawHref);

    const absolute = href.startsWith("http")
      ? href
      : new URL(href, ROOT).toString();

    found.add(absolute);
  }

  return [...found];
}

async function parseRecord(
  url: string,
): Promise<OpenCanadaAward | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "ApexFundingWatch/1.4",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const text = textOnly(html);

  if (text.length < 100) {
    return null;
  }

  const names = [
    "Title",
    "Agreement Number",
    "Agreement Value",
    "Agreement Date",
    "Description",
    "Organization",
    "Expected Results",
    "Location",
    "Reference Number",
    "Agreement Type",
    "Report Type",
    "Recipient Business Number",
    "Recipient Type",
    "Recipient's Operating Name",
    "Recipient's Legal Name",
    "Federal Riding Name",
    "Federal Riding Number",
    "Program",
    "Program Purpose",
    "Coverage",
    "NAICS Code",
  ];

  const get = (name: string) =>
    label(
      text,
      name,
      names.filter(
        (item) => item !== name,
      ),
    );

  const dates = parseAgreementDates(
    get("Agreement Date"),
  );

  return {
    programName: get("Program"),

    recipientName:
      get("Recipient's Legal Name") ??
      get("Recipient's Operating Name"),

    recipientType:
      get("Recipient Type"),

    projectTitle:
      get("Title"),

    description:
      get("Description"),

    amount:
      parseMoney(
        get("Agreement Value"),
      ),

    agreementStartDate:
      dates.start,

    agreementEndDate:
      dates.end,

    location:
      get("Location"),

    federalOrganization:
      get("Organization"),

    agreementNumber:
      get("Agreement Number"),

    sourceUrl: url,

    rawContent:
      text.slice(0, 20000),
  };
}

function matchesProgram(
  programHint: string,
  award: OpenCanadaAward,
) {
  const haystack =
    `${award.programName ?? ""} ` +
    `${award.description ?? ""} ` +
    `${award.projectTitle ?? ""}`;

  const hay =
    haystack.toLowerCase();

  const hint =
    programHint.toLowerCase();

  if (hint.includes("canexport")) {
    return hay.includes("canexport");
  }

  if (
    hint.includes("pari") ||
    hint.includes("irap") ||
    hint.includes(
      "industrial research assistance",
    )
  ) {
    return (
      hay.includes(
        "industrial research assistance",
      ) ||
      hay.includes("irap") ||
      hay.includes("pari")
    );
  }

  return hay.includes(hint);
}

export async function collectOpenCanadaAwards(
  programHint: string,
  limit = 8,
): Promise<OpenCanadaAward[]> {
  const ownerOrg = resolveOwnerOrg(programHint);
  const urls = new Set<string>();

  for (
    let page = 1;
    page <= 6 && urls.size < 80;
    page += 1
  ) {
    const pageUrls =
      await recordUrls(page, ownerOrg);

    for (const url of pageUrls) {
      urls.add(url);
    }
  }

  const allUrls =
    [...urls].slice(0, 80);

  const results:
    OpenCanadaAward[] = [];

  const chunkSize = 8;

  for (
    let i = 0;
    i < allUrls.length &&
    results.length < limit;
    i += chunkSize
  ) {
    const chunk = allUrls.slice(
      i,
      i + chunkSize,
    );

    const parsed =
      await Promise.all(
        chunk.map((url) =>
          parseRecord(url),
        ),
      );

    for (const award of parsed) {
      if (
        award &&
        matchesProgram(
          programHint,
          award,
        )
      ) {
        results.push(award);
      }

      if (
        results.length >= limit
      ) {
        break;
      }
    }
  }

  return results.slice(
    0,
    limit,
  );
}