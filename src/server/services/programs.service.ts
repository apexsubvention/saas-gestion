import type { SupabaseClient } from "@supabase/supabase-js";
import { programsRepository } from "@/server/repositories/programs.repository";
import { createProgramSchema, type CreateProgramInput } from "@/features/programs/schemas";

export function programsService(supabase: SupabaseClient) {
  const repo = programsRepository(supabase);
  return {
    list: () => repo.list(),
    async create(organizationId: string, input: CreateProgramInput) {
      const parsed = createProgramSchema.parse(input);
      return repo.create({
        organization_id: organizationId,
        name: parsed.name,
        agency: parsed.agency || null,
        description: parsed.description || null,
        program_type: parsed.program_type || null,
        territory: parsed.territory || null,
      });
    },
  };
}
