// Seul endroit qui parle a Supabase pour "clients". Aucune regle metier ici.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientRow = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  website: string | null;
  sector: string | null;
  address: string | null;
  notes: string | null;
  owner_id: string | null;
  tags: string[];
  created_at: string;
  last_activity_at: string | null;
  current_needs: string | null;
  needs_updated_at: string | null;
  needs_updated_by: string | null;
};

export function clientsRepository(supabase: SupabaseClient) {
  return {
    async list(): Promise<ClientRow[]> {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientRow[];
    },

    async findById(id: string): Promise<ClientRow | null> {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },

    async findByName(name: string): Promise<ClientRow | null> {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .ilike("name", name.trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },

    async create(input: {
      organization_id: string;
      name: string;
      status: string;
      website?: string | null;
      sector?: string | null;
      address?: string | null;
      notes?: string | null;
      owner_id?: string | null;
    }): Promise<ClientRow> {
      const { data, error } = await supabase.from("clients").insert(input).select().single();
      if (error) throw error;
      return data as ClientRow;
    },

    async updateNeeds(
      id: string,
      input: { current_needs: string | null; needs_updated_by: string | null }
    ): Promise<ClientRow> {
      const { data, error } = await supabase
        .from("clients")
        .update({
          current_needs: input.current_needs,
          needs_updated_at: new Date().toISOString(),
          needs_updated_by: input.needs_updated_by,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ClientRow;
    },
  };
}
