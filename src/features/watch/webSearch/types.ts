// Types partagés serveur/client : aucun import serveur ici (le composant client les importe).

export type WebAvailability = "open" | "opening_soon" | "continuous" | "closed" | "unknown";
export type WebConfidence = "high" | "medium" | "low";

export type WebProgramResult = {
  name: string;
  organization: string | null;
  url: string;
  summary: string;
  why_it_fits: string;
  funding_type: string | null;
  amount_text: string | null;
  rate_text: string | null;
  deadline_text: string | null;
  availability: WebAvailability;
  eligibility_to_verify: string | null;
  confidence: WebConfidence;
};

export type DeepSearchResult = {
  programs: WebProgramResult[];
  notes: string | null;
  sources: Array<{ title: string; url: string }>;
  searchesUsed: number;
  droppedUnverified: number; // résultats écartés faute de source vérifiable
  model: string;
  searchedAt: string;
};

export type DeepSearchActionResult =
  | { ok: true; result: DeepSearchResult; cached: boolean }
  | { ok: false; error: string };
