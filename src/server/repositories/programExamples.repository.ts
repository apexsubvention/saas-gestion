import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgramExampleRow = {
  id: string;
  organization_id: string;
  program_id: string;
  title: string;
  recipient_name: string | null;
  description: string | null;
  amount: number | null;
  location: string | null;
  source_url: string;
  source_kind: "program_page" | "open_canada" | "manual";
  created_at: string;
};

export type ProgramExampleInput = Omit<ProgramExampleRow, "id" | "created_at">;

export function programExamplesRepository(supabase: SupabaseClient) {
  return {
    async listByProgram(programId: string): Promise<ProgramExampleRow[]> {
      const { data, error } = await supabase
        .from("program_funded_examples")
        .select("*")
        .eq("program_id", programId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProgramExampleRow[];
    },
    async listAll(): Promise<ProgramExampleRow[]> {
      const { data, error } = await supabase.from("program_funded_examples").select("*");
      if (error) throw error;
      return data as ProgramExampleRow[];
    },
    // Relire une page ne doit pas dupliquer les exemples déjà connus (unique program+source+titre).
    async addMany(rows: ProgramExampleInput[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("program_funded_examples")
        .upsert(rows, { onConflict: "program_id,source_url,title", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}
