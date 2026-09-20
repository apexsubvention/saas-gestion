// Résultat normalisé de la lecture d'une page de programme. Les montants sont en dollars
// canadiens ; aid_rate est une FRACTION 0-1 (comme grant_programs.typical_aid_rate).

export const AVAILABILITY_VALUES = ["open", "opening_soon", "continuous", "closed", "unknown"] as const;
export type Availability = (typeof AVAILABILITY_VALUES)[number];

export type ProgramExtraction = {
  name: string | null;
  agency: string | null;
  description: string | null;
  program_type: string | null;
  territory: string | null;
  aid_rate: number | null;
  max_aid_amount: number | null;
  min_eligible_spend: number | null;
  aid_notes: string | null;
  open_date: string | null; // AAAA-MM-JJ
  deadline: string | null; // AAAA-MM-JJ
  filing_notes: string | null;
  availability_status: Availability | null;
  eligible_expenses: string | null;
  ineligible_expenses: string | null;
  application_process: string | null;
  claim_process: string | null;
  required_documents: string[];
  government_priorities: string[];
};

export type ResourceLinkKind = "guide" | "formulaire" | "exemple" | "autre";
export type ResourceLink = { label: string; url: string; kind: ResourceLinkKind };

export type FundedExample = {
  title: string;
  recipient_name: string | null;
  description: string | null;
  amount: number | null;
  location: string | null;
  source_url: string;
};

export type ProgramReadResult = {
  status: "ok" | "partial" | "error";
  method: "llm" | "heuristic" | null;
  error: string | null;
  fields: ProgramExtraction;
  resourceLinks: ResourceLink[];
  examples: FundedExample[];
  sourceText: string | null;
  pagesRead: string[];
};

export function emptyExtraction(): ProgramExtraction {
  return {
    name: null, agency: null, description: null, program_type: null, territory: null,
    aid_rate: null, max_aid_amount: null, min_eligible_spend: null, aid_notes: null,
    open_date: null, deadline: null, filing_notes: null, availability_status: null,
    eligible_expenses: null, ineligible_expenses: null, application_process: null, claim_process: null,
    required_documents: [], government_priorities: [],
  };
}
