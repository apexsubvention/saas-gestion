import type { SupabaseClient } from "@supabase/supabase-js";
import { clientNotesRepository, type ClientNoteRow } from "@/server/repositories/clientNotes.repository";

export type ClientNoteView = {
  id: string;
  clientId: string;
  body: string;
  createdAt: string;
  visibleToClient: boolean;
  authorOrgUserId: string;
  authorName: string;
  authorRole: "staff" | "client";
};

function toView(row: ClientNoteRow): ClientNoteView {
  return {
    id: row.id,
    clientId: row.client_id,
    body: row.body,
    createdAt: row.created_at,
    visibleToClient: row.visible_to_client,
    authorOrgUserId: row.author_org_user_id,
    authorName: row.author_name,
    authorRole: row.author_role,
  };
}

export function clientNotesService(supabase: SupabaseClient) {
  const repo = clientNotesRepository(supabase);

  return {
    async listByClient(clientId: string): Promise<ClientNoteView[]> {
      const rows = await repo.listByClient(clientId);
      return rows.map(toView);
    },

    // Regroupées par client_id (0062) : un seul aller-retour pour alimenter un fil par client
    // affiché dans le portail (le sien + ses clients enfants).
    async listByClientsGrouped(clientIds: string[]): Promise<Map<string, ClientNoteView[]>> {
      const rows = await repo.listByClients(clientIds);
      const byClient = new Map<string, ClientNoteView[]>();
      for (const row of rows) {
        const view = toView(row);
        const list = byClient.get(view.clientId) ?? [];
        list.push(view);
        byClient.set(view.clientId, list);
      }
      return byClient;
    },

    async add(input: {
      organizationId: string;
      clientId: string;
      authorOrgUserId: string;
      authorRole: "staff" | "client";
      authorName: string;
      body: string;
      visibleToClient: boolean;
    }): Promise<ClientNoteView> {
      const body = input.body.trim();
      if (!body) throw new Error("Écris un message avant d'envoyer.");
      if (body.length > 4000) throw new Error("Message trop long (4000 caractères max).");
      const row = await repo.create({
        organization_id: input.organizationId,
        client_id: input.clientId,
        author_org_user_id: input.authorOrgUserId,
        author_role: input.authorRole,
        author_name: input.authorName.trim() || (input.authorRole === "client" ? "Le client" : "Membre de l'équipe"),
        body,
        visible_to_client: input.visibleToClient,
      });
      return toView(row);
    },

    async remove(id: string): Promise<void> {
      await repo.remove(id);
    },
  };
}
