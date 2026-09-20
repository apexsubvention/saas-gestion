import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResourceLink } from "@/features/programs/reader/types";

export type ProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  agency: string | null;
  description: string | null;
  program_type: string | null;
  territory: string | null;
  typical_aid_rate: number | null; // fraction 0-1
  max_aid_amount: number | null;
  eligible_expenses: string | null;
  ineligible_expenses: string | null;
  application_process: string | null;
  claim_process: string | null;
  required_documents: string[] | null;
  created_at: string;
  // Ajoutés par 0031
  source_url: string | null;
  open_date: string | null;
  deadline: string | null;
  filing_notes: string | null;
  availability_status: "open" | "opening_soon" | "continuous" | "closed" | "unknown";
  min_eligible_spend: number | null;
  aid_notes: string | null;
  government_priorities: string[];
  resource_links: ResourceLink[];
  source_text: string | null;
  extraction_method: "llm" | "heuristic" | null;
  last_read_at: string | null;
  read_status: "never" | "ok" | "partial" | "error";
  read_error: string | null;
};

// Colonnes modifiables (jamais organization_id / id / created_at).
export type ProgramWrite = Partial<Omit<ProgramRow, "id" | "organization_id" | "created_at">>;

export function programsRepository(supabase: SupabaseClient) {
  return {
    async list(): Promise<ProgramRow[]> {
      const { data, error } = await supabase.from("grant_programs").select("*").order("name");
      if (error) throw error;
      return data as ProgramRow[];
    },
    async findById(id: string): Promise<ProgramRow | null> {
      const { data, error } = await supabase.from("grant_programs").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as ProgramRow | null;
    },
    async findBySourceUrl(url: string): Promise<ProgramRow | null> {
      const { data, error } = await supabase.from("grant_programs").select("*").eq("source_url", url).limit(1).maybeSingle();
      if (error) throw error;
      return data as ProgramRow | null;
    },
    async findByName(name: string): Promise<ProgramRow | null> {
      const { data, error } = await supabase
        .from("grant_programs")
        .select("*")
        .ilike("name", name.trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ProgramRow | null;
    },
    async create(input: ProgramWrite & { organization_id: string; name: string }): Promise<ProgramRow> {
      const { data, error } = await supabase.from("grant_programs").insert(input).select().single();
      if (error) throw error;
      return data as ProgramRow;
    },
    async update(id: string, patch: ProgramWrite): Promise<ProgramRow> {
      const { data, error } = await supabase.from("grant_programs").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as ProgramRow;
    },
  };
}
