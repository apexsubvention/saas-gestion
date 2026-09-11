import type { SupabaseClient } from "@supabase/supabase-js";
import { clientsRepository } from "@/server/repositories/clients.repository";
import { createClientSchema, type CreateClientInput } from "@/features/clients/schemas";

export function clientsService(supabase: SupabaseClient) {
  const repo = clientsRepository(supabase);

  return {
    list: () => repo.list(),
    get: (id: string) => repo.findById(id),

    async create(organizationId: string, ownerId: string, input: CreateClientInput) {
      const parsed = createClientSchema.parse(input);
      return repo.create({
        organization_id: organizationId,
        name: parsed.name,
        status: parsed.status,
        website: parsed.website || null,
        sector: parsed.sector || null,
        address: parsed.address || null,
        notes: parsed.notes || null,
        owner_id: ownerId,
      });
    },
  };
}
