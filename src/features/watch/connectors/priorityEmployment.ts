import type { CollectedOpportunity } from "./quebec";

type ProgramSeed = {
  canonicalKey: string;
  title: string;
  url: string;
  organization: string;
  territory: "Québec" | "Canada";
  fundingType: CollectedOpportunity["fundingType"];
  categories: string[];
  maxAmount?: number;
  preparationDocuments?: string[];
  preparationNotes?: string;
};

const PROGRAMS: ProgramSeed[] = [
  {
    canonicalKey: "services-quebec:mfor",
    title: "Programme de formation de la main-d’œuvre (MFOR)",
    url: "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/administrer-gerer/embauche-gestion-personnel/former-main-oeuvre/developper-competences",
    organization: "Services Québec",
    territory: "Québec",
    fundingType: "grant",
    categories: ["Formation", "Main-d’œuvre", "Employeurs"],
    preparationNotes:
      "La page officielle indique qu’un conseiller Services Québec analyse les besoins et propose une solution adaptée. La liste finale des pièces peut varier selon le projet; Apex doit donc distinguer les documents explicitement exigés des éléments à préparer en amont.",
  },
  {
    canonicalKey: "services-quebec:subvention-salariale-durable",
    title:
      "Aide financière à l’embauche d’une personne pour intégrer un emploi de façon durable",
    url: "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/administrer-gerer/embauche-gestion-personnel/recruter/aider-personne-integrer-emploi-maniere-durable",
    organization: "Services Québec",
    territory: "Québec",
    fundingType: "wage_subsidy",
    categories: ["Embauche", "Subvention salariale", "Main-d’œuvre"],
    preparationDocuments: [
      "Lettre de subvention salariale valide de la personne candidate",
      "Formulaire Demande de subvention salariale — Entreprise privée",
    ],
    preparationNotes:
      "La personne candidate doit être évaluée par Services Québec et être admissible à la subvention salariale. Le poste et l’employeur font aussi l’objet d’une validation.",
  },
  {
    canonicalKey: "ictc:wil-digital",
    title: "ICTC — WIL Digital",
    url: "https://ictc-ctic.smapply.ca/prog/wil_digital/",
    organization: "ICTC / CTIC",
    territory: "Canada",
    fundingType: "internship",
    categories: ["Stage", "Étudiant", "Numérique", "Technologie"],
    maxAmount: 5000,
    preparationNotes:
      "Le rôle doit offrir une expérience d’apprentissage intégrée au travail et être aligné sur le programme d’études postsecondaires de l’étudiant. La page de dépôt exige un précontrôle d’admissibilité employeur.",
  },
  {
    canonicalKey: "eco-canada:student-work-placement",
    title: "ECO Canada — Programme de stages pratiques pour étudiants",
    url: "https://eco.ca/fr/etudiants/programme-de-stages-pour-etudiants/",
    organization: "ECO Canada",
    territory: "Canada",
    fundingType: "internship",
    categories: ["Stage", "Étudiant", "Environnement", "STEAM", "Affaires"],
    maxAmount: 5000,
    preparationNotes:
      "Pour les cohortes 2026-2027, ECO Canada indique un soutien pouvant atteindre 50 % du salaire jusqu’à 5 000 $ par participant, sous réserve des critères du programme et des fonds disponibles.",
  },
  {
    canonicalKey: "pratiques-rh:accueillez-un-stagiaire",
    title: "Pratiques RH — Accueillez un stagiaire",
    url: "https://pratiquesrh.com/services/accueillez-un-stagiaire",
    organization: "Pratiques RH",
    territory: "Québec",
    fundingType: "internship",
    categories: ["Stage", "Étudiant", "RH", "Québec"],
    maxAmount: 5000,
    preparationDocuments: [
      "Accord de l’étudiant ou de l’étudiante",
      "Attestation de l’établissement d’enseignement",
      "Copie du contrat de stage",
      "Entente de subvention signée (pour le premier versement)",
      "Copie du premier relevé de paie du stagiaire (pour le premier versement)",
      "Spécimen de chèque (pour le premier versement)",
    ],
    preparationNotes:
      "La page publie les périodes de dépôt par session et les pièces demandées aux étapes de candidature et de versement.",
  },
  {
    canonicalKey: "technation:career-ready",
    title: "TECHNATION — Career Ready",
    url: "https://careerready.technationcanada.ca/",
    organization: "TECHNATION",
    territory: "Canada",
    fundingType: "internship",
    categories: ["Stage", "Étudiant", "Technologie", "Numérique"],
    maxAmount: 5000,
    preparationNotes:
      "Career Ready soutient les stages étudiants dans des rôles technologiques. Les cohortes ont leurs propres dates d’ouverture et de fermeture; Apex lit la page courante pour déterminer le statut.",
  },
];

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
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
      .trim(),
  );
}

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  janvier: "01",
  feb: "02",
  february: "02",
  février: "02",
  fevrier: "02",
  mar: "03",
  march: "03",
  mars: "03",
  apr: "04",
  april: "04",
  avril: "04",
  may: "05",
  mai: "05",
  jun: "06",
  june: "06",
  juin: "06",
  jul: "07",
  july: "07",
  juillet: "07",
  aug: "08",
  august: "08",
  août: "08",
  aout: "08",
  sep: "09",
  sept: "09",
  september: "09",
  septembre: "09",
  oct: "10",
  october: "10",
  octobre: "10",
  nov: "11",
  november: "11",
  novembre: "11",
  dec: "12",
  december: "12",
  décembre: "12",
  decembre: "12",
};

function normalizeMonth(value: string) {
  return value
    .toLowerCase()
    .replace(".", "")
    .trim();
}

function buildIsoDate(
  day: string | undefined,
  month: string | undefined,
  year: string | undefined,
) {
  if (!day || !month || !year) return null;

  const monthNumber = MONTH_MAP[normalizeMonth(month)];

  if (!monthNumber) return null;

  return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
}

function parseDateAfterKeywords(
  text: string,
  keywords: RegExp,
) {
  const isoMatch = text.match(
    new RegExp(
      `${keywords.source}\\s*(20\\d{2}-\\d{2}-\\d{2})`,
      "i",
    ),
  );

  const iso = isoMatch?.[1];

  if (iso) return iso;

  const frenchOrEnglishMatch = text.match(
    new RegExp(
      `${keywords.source}\\s*(\\d{1,2})\\s+([A-Za-zÀ-ÿ.]+)\\s+(20\\d{2})`,
      "i",
    ),
  );

  if (!frenchOrEnglishMatch) return null;

  return buildIsoDate(
    frenchOrEnglishMatch[1],
    frenchOrEnglishMatch[2],
    frenchOrEnglishMatch[3],
  );
}

function inferAvailability(
  text: string,
  seed: ProgramSeed,
) {
  const normalized = text.toLowerCase();

  const today = new Date();

  const openDate = parseDateAfterKeywords(
    text,
    /(?:opens?|ouverture|à partir du|a partir du)/i,
  );

  const deadline = parseDateAfterKeywords(
    text,
    /(?:deadline|date limite|jusqu['’]au|avant le)/i,
  );

  if (
    /now closed|fermé|fermée|terminé|terminée/.test(
      normalized,
    ) &&
    !/now open|ouvert|ouverte/.test(
      normalized,
    )
  ) {
    return {
      availabilityStatus: "closed" as const,
      openDate,
      deadline,
      expectedOpenDate: null,
    };
  }

  if (
    /opening soon|ouvrira bientôt|ouvre bientôt|ouverture bientôt|à venir/.test(
      normalized,
    )
  ) {
    return {
      availabilityStatus:
        "opening_soon" as const,
      openDate,
      deadline,
      expectedOpenDate: openDate,
    };
  }

  if (
    /now open|ouvert|ouverte|déposer une demande|apply now|déposez dès aujourd'hui/.test(
      normalized,
    )
  ) {
    return {
      availabilityStatus: "open" as const,
      openDate,
      deadline,
      expectedOpenDate: null,
    };
  }

  if (openDate) {
    const timestamp = new Date(
      `${openDate}T00:00:00`,
    ).getTime();

    if (
      Number.isFinite(timestamp) &&
      timestamp > today.getTime()
    ) {
      return {
        availabilityStatus:
          "opening_soon" as const,
        openDate: null,
        deadline,
        expectedOpenDate: openDate,
      };
    }
  }

  if (
    seed.canonicalKey.startsWith(
      "services-quebec:",
    )
  ) {
    return {
      availabilityStatus:
        "continuous" as const,
      openDate,
      deadline,
      expectedOpenDate: null,
    };
  }

  return {
    availabilityStatus:
      "unknown" as const,
    openDate,
    deadline,
    expectedOpenDate: null,
  };
}

async function fetchProgram(
  seed: ProgramSeed,
): Promise<CollectedOpportunity> {
  const response = await fetch(seed.url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "ApexFundingWatch/1.2",
      Accept:
        "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `${seed.organization} a répondu HTTP ${response.status} pour ${seed.title}`,
    );
  }

  const html = await response.text();
  const content = textOnly(html);

  if (content.length < 200) {
    throw new Error(
      `Réponse trop courte pour ${seed.title}`,
    );
  }

  const availability =
    inferAvailability(content, seed);

  const summary =
    content.slice(0, 900);

  return {
    canonicalKey:
      seed.canonicalKey,

    title:
      seed.title,

    summary,

    officialUrl:
      seed.url,

    organization:
      seed.organization,

    territory:
      seed.territory,

    fundingType:
      seed.fundingType,

    categories:
      seed.categories,

    rawContent:
      content.slice(0, 12000),

    maxAmount:
      seed.maxAmount ?? null,

    openDate:
      availability.openDate,

    deadline:
      availability.deadline,

    availabilityStatus:
      availability.availabilityStatus,

    expectedOpenDate:
      availability.expectedOpenDate,

    preparationDocuments:
      seed.preparationDocuments ?? [],

    preparationNotes:
      seed.preparationNotes ?? null,

    preparationSourceUrl:
      seed.url,
  };
}

export const PRIORITY_EMPLOYMENT_CONNECTORS =
  PROGRAMS.map((seed) => ({
    source: {
      name: seed.organization,
      baseUrl: seed.url,

      sourceFamily:
        seed.organization ===
        "Services Québec"
          ? "provincial_ministry"
          : "funding_intermediary",

      geographicLevel:
        seed.territory === "Québec"
          ? "province_territory"
          : "canada",

      territoryLabel:
        seed.territory,

      isOfficial:
        seed.organization ===
        "Services Québec",
    },

    collect: async () => [
      await fetchProgram(seed),
    ],
  }));