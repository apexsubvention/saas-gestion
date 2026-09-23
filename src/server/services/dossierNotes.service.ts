import type { SupabaseClient } from "@supabase/supabase-js";
import { dossierNotesRepository, type DossierNoteRow } from "@/server/repositories/dossierNotes.repository";

export type DossierNoteView = {
  id: string;
  body: string;
  createdAt: string;
  visibleToClient: boolean;
  authorOrgUserId: string;
  authorName: string;
  authorRole: "staff" | "client";
};

function toView(row: DossierNoteRow): DossierNoteView {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    visibleToClient: row.visible_to_client,
    authorOrgUserId: row.author_org_user_id,
    authorName: row.author_name,
    authorRole: row.author_role,
  };
}

export function dossierNotesService(supabase: SupabaseClient) {
  const repo = dossierNotesRepository(supabase);

  return {
    async listByProject(grantProjectId: string): Promise<DossierNoteView[]> {
      const rows = await repo.listByProject(grantProjectId);
      return rows.map(toView);
    },

    async add(input: {
      organizationId: string;
      grantProjectId: string;
      clientId: string;
      authorOrgUserId: string;
      authorRole: "staff" | "client";
      authorName: string;
      body: string;
      visibleToClient: boolean;
    }): Promise<DossierNoteView> {
      const body = input.body.trim();
      if (!body) throw new Error("Écris un message avant d'envoyer.");
      if (body.length > 4000) throw new Error("Message trop long (4000 caractères max).");
      const row = await repo.create({
        organization_id: input.organizationId,
        grant_project_id: input.grantProjectId,
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
