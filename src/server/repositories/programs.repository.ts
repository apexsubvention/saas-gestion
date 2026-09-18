import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  agency: string | null;
  description: string | null;
  program_type: string | null;
  territory: string | null;
  created_at: string;
};

export function programsRepository(supabase: SupabaseClient) {
  return {
    async list(): Promise<ProgramRow[]> {
      const { data, error } = await supabase.from("grant_programs").select("*").order("name");
      if (error) throw error;
      return data as ProgramRow[];
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
    async create(input: {
      organization_id: string;
      name: string;
      agency?: string | null;
      description?: string | null;
      program_type?: string | null;
      territory?: string | null;
    }): Promise<ProgramRow> {
      const { data, error } = await supabase.from("grant_programs").insert(input).select().single();
      if (error) throw error;
      return data as ProgramRow;
    },
  };
}
