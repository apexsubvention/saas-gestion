import type { CollectedOpportunity } from "./quebec";

const MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—");
}

export function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function numberFromText(value?: string | null) {
  if (!value) return null;

  const n = Number(
    value
      .replace(/\s/g, "")
      .replace(/,/g, ".")
      .replace(/[^0-9.]/g, ""),
  );

  return Number.isFinite(n) ? n : null;
}

function toIsoDate(day: string, month: string, year: string) {
  const m = MONTHS[month.toLowerCase()];

  if (m === undefined) return null;

  const d = new Date(
    Date.UTC(Number(year), m, Number(day)),
  );

  return d.toISOString().slice(0, 10);
}

function extractFrenchDate(
  text: string,
  prefix: RegExp,
) {
  const match = text.match(
    new RegExp(
      `${prefix.source}\\s*(?:le\\s*)?(\\d{1,2})\\s+([A-Za-zÀ-ÿ]+)\\s+(20\\d{2})`,
      "i",
    ),
  );

  if (!match) return null;

  const day = match[1];
  const month = match[2];
  const year = match[3];

  if (!day || !month || !year) {
    return null;
  }

  return toIsoDate(day, month, year);
}

function extractFrenchDateTimeRange(text: string) {
  const match = text.match(
    /(?:ouvert|ouverte|période[^.]{0,50}|réception[^.]{0,50})\s+du\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(20\d{2})(?:\s+à\s+(midi|\d{1,2}\s*h(?:\s*\d{1,2})?))?\s+au\s+(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+)\s+(20\d{2})(?:\s+à\s+(midi|\d{1,2}\s*h(?:\s*\d{1,2})?))?/i,
  );

  if (!match) return null;

  const startDay = match[1];
  const startMonth = match[2];
  const startYear = match[3];

  const endDay = match[5];
  const endMonth = match[6];
  const endYear = match[7];

  if (
    !startDay ||
    !startMonth ||
    !startYear ||
    !endDay ||
    !endMonth ||
    !endYear
  ) {
    return null;
  }

  const start = toIsoDate(
    startDay,
    startMonth,
    startYear,
  );

  const end = toIsoDate(
    endDay,
    endMonth,
    endYear,
  );

  if (!start || !end) return null;

  const toTime = (value?: string) => {
    if (
      !value ||
      value.toLowerCase() === "midi"
    ) {
      return "12:00:00";
    }

    const timeMatch = value.match(
      /(\d{1,2})\s*h(?:\s*(\d{1,2}))?/i,
    );

    if (!timeMatch) {
      return "12:00:00";
    }

    const hour = timeMatch[1];
    const minute = timeMatch[2] ?? "00";

    if (!hour) {
      return "12:00:00";
    }

    return `${hour.padStart(2, "0")}:${minute.padStart(
      2,
      "0",
    )}:00`;
  };

  return {
    startAt: `${start}T${toTime(
      match[4],
    )}-04:00`,
    endAt: `${end}T${toTime(
      match[8],
    )}-04:00`,
    startDate: start,
    endDate: end,
  };
}

function extractMaxAmount(text: string) {
  const patterns = [
    /aide financière maximale\s*[:\-]?\s*([0-9][0-9\s.,]*)\s*\$/i,
    /jusqu[’']?à\s*([0-9][0-9\s.,]*)\s*\$/i,
    /maximum(?: de)?\s*([0-9][0-9\s.,]*)\s*\$/i,
    /up to\s*\$?([0-9][0-9, .]*)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = numberFromText(match?.[1]);

    if (value && value >= 100) {
      return value;
    }
  }

  return null;
}

function extractMaxRate(text: string) {
  const matches = [
    ...text.matchAll(
      /taux d['’]aide maximal[^%]{0,160}?([0-9]{1,3})\s*%/gi,
    ),
    ...text.matchAll(
      /jusqu[’']?à\s*([0-9]{1,3})\s*%\s+des dépenses admissibles/gi,
    ),
    ...text.matchAll(
      /funds? up to\s*([0-9]{1,3})\s*%/gi,
    ),
  ];

  const values = matches
    .map((match) => {
      const raw = match[1];
      return raw ? Number(raw) : NaN;
    })
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100,
    );

  return values.length
    ? Math.max(...values)
    : null;
}

function extractMinEligibleSpend(text: string) {
  const match =
    text.match(
      /montant minimal des dépenses admissibles[^0-9]{0,120}?([0-9][0-9\s.,]*)\s*\$/i,
    ) ??
    text.match(
      /minimum[^0-9]{0,40}([0-9][0-9\s.,]*)\s*\$[^.]{0,40}dépenses admissibles/i,
    );

  return numberFromText(match?.[1]);
}

function extractPrivateRate(text: string) {
  const match = text.match(
    /apport minimal de sources privées\s*[:\-]?\s*([0-9]{1,3})\s*%/i,
  );

  const raw = match?.[1];

  return raw ? Number(raw) : null;
}

function extractStackingRate(text: string) {
  const match =
    text.match(
      /cumul des aides gouvernementales[^%]{0,80}?([0-9]{1,3})\s*%/i,
    ) ??
    text.match(
      /government assistance[^%]{0,100}?([0-9]{1,3})\s*%/i,
    );

  const raw = match?.[1];

  return raw ? Number(raw) : null;
}

function extractUpdatedLabel(text: string) {
  return (
    text.match(
      /mis à jour le\s+\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+20\d{2}/i,
    )?.[0] ?? null
  );
}

function inferAvailability(
  text: string,
  range: ReturnType<
    typeof extractFrenchDateTimeRange
  >,
) {
  const lower = text.toLowerCase();
  const now = Date.now();

  if (range) {
    const start = new Date(
      range.startAt,
    ).getTime();

    const end = new Date(
      range.endAt,
    ).getTime();

    if (now < start) {
      return "opening_soon" as const;
    }

    if (now <= end) {
      return "open" as const;
    }

    return "closed" as const;
  }

  if (
    /applications? are not being accepted|n['’]accepte pas.*demande|période.*terminée|programme.*fermé/.test(
      lower,
    )
  ) {
    return "closed" as const;
  }

  if (
    /ouverture bientôt|ouvrira bientôt|opening soon/.test(
      lower,
    )
  ) {
    return "opening_soon" as const;
  }

  if (
    /en continu|continuous intake|applications? accepted.*until further notice/.test(
      lower,
    )
  ) {
    return "continuous" as const;
  }

  if (
    /accepte.*demande|déposer une demande|applications? (?:are )?accepted|maintenant ouvert/.test(
      lower,
    )
  ) {
    return "open" as const;
  }

  return "unknown" as const;
}

function extractPriorities(text: string) {
  const lower = text.toLowerCase();

  const priorities: string[] = [];

  const rules: Array<[RegExp, string]> = [
    [
      /diversification/,
      "Diversification des marchés",
    ],
    [/amérique latine/, "Amérique latine"],
    [/asie[- ]pacifique/, "Asie-Pacifique"],
    [/moyen[- ]orient/, "Moyen-Orient"],
    [/océanie/, "Océanie"],
    [
      /intelligence artificielle|\bia\b/,
      "Intelligence artificielle",
    ],
    [
      /technologies? propres?|cleantech/,
      "Technologies propres",
    ],
    [/cybersécur/, "Cybersécurité"],
    [
      /défense|dual[- ]use|double usage/,
      "Défense / double usage",
    ],
    [/commercialisation/, "Commercialisation"],
    [/productivit/, "Productivité"],
    [/export/, "Exportation"],
  ];

  for (const [pattern, label] of rules) {
    if (
      pattern.test(lower) &&
      !priorities.includes(label)
    ) {
      priorities.push(label);
    }
  }

  return priorities.slice(0, 8);
}

export async function enrichOfficialOpportunity(
  item: CollectedOpportunity,
): Promise<CollectedOpportunity> {
  const response = await fetch(
    item.officialUrl,
    {
      cache: "no-store",
      headers: {
        "User-Agent":
          "ApexFundingWatch/1.4",
        Accept:
          "text/html,application/xhtml+xml",
      },
    },
  );

  if (!response.ok) {
    return item;
  }

  const html = await response.text();

  if (html.length < 300) {
    return item;
  }

  const text = htmlToText(html);

  const range =
    extractFrenchDateTimeRange(text);

  const openDate =
    range?.startDate ??
    extractFrenchDate(
      text,
      /(ouverture|début|à partir de)/i,
    ) ??
    item.openDate ??
    null;

  const deadline =
    range?.endDate ??
    extractFrenchDate(
      text,
      /(échéance|date limite|jusqu['’]au|fermeture)/i,
    ) ??
    item.deadline ??
    null;

  const availabilityStatus =
    inferAvailability(text, range);

  return {
    ...item,

    rawContent: text.slice(0, 50000),

    maxAmount:
      extractMaxAmount(text) ??
      item.maxAmount ??
      null,

    openDate,

    deadline,

    availabilityStatus:
      availabilityStatus === "unknown"
        ? item.availabilityStatus
        : availabilityStatus,

    expectedOpenDate:
      availabilityStatus ===
      "opening_soon"
        ? range?.startDate ??
          item.expectedOpenDate ??
          openDate
        : item.expectedOpenDate ?? null,

    fundingRateMax:
      extractMaxRate(text),

    minEligibleSpend:
      extractMinEligibleSpend(text),

    privateContributionMinRate:
      extractPrivateRate(text),

    stackingLimitRate:
      extractStackingRate(text),

    intakeStartAt:
      range?.startAt ?? null,

    intakeEndAt:
      range?.endAt ?? null,

    officialPageUpdatedAt:
      extractUpdatedLabel(text),

    governmentPriorities:
      extractPriorities(text),

    deepReadAt:
      new Date().toISOString(),
  };
}