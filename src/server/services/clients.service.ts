import type { SupabaseClient } from "@supabase/supabase-js";
import { clientsRepository } from "@/server/repositories/clients.repository";
import { createClientSchema, updateClientNeedsSchema, type CreateClientInput } from "@/features/clients/schemas";

export function clientsService(supabase: SupabaseClient) {
  const repo = clientsRepository(supabase);

  return {
    list: () => repo.list(),
    get: (id: string) => repo.findById(id),
    listChildren: (parentClientId: string) => repo.listChildren(parentClientId),

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

    async updateNeeds(id: string, updatedBy: string, input: { current_needs: string }) {
      const parsed = updateClientNeedsSchema.parse(input);
      return repo.updateNeeds(id, {
        current_needs: parsed.current_needs || null,
        needs_updated_by: updatedBy,
      });
    },

    // Rattache clientId comme enfant de parentClientId (ou détache si null). Garde-fou
    // applicatif simple contre un cycle direct A<->B en plus de la contrainte SQL qui
    // empêche seulement l'auto-référence directe -- le plafond de profondeur dans
    // can_access_client() protège contre un cycle plus long créé malgré tout.
    async setParent(clientId: string, parentClientId: string | null) {
      if (parentClientId === clientId) {
        throw new Error("Un client ne peut pas être son propre parent.");
      }
      if (parentClientId) {
        const parent = await repo.findById(parentClientId);
        if (!parent) {
          throw new Error("Client parent introuvable.");
        }
        if (parent.parent_client_id === clientId) {
          throw new Error("Ce client est déjà le parent du client sélectionné — cela créerait un cycle.");
        }
      }
      return repo.updateParent(clientId, parentClientId);
    },
  };
}
