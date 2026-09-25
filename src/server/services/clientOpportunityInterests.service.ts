import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clientOpportunityInterestsRepository,
  type ClientOpportunityInterestRow,
  type OpportunityInterestStatus,
} from "@/server/repositories/clientOpportunityInterests.repository";
import { notifyUser } from "@/server/services/notifications.service";

// Portail -> personnel : un client signale son intérêt pour une opportunité de la veille.
// L'insertion de la ligne elle-même passe par le client RLS du portail (policy
// client_opportunity_interests_insert, 0052) ; la notification au personnel a besoin du client admin
// car l'écriture dans `notifications` est réservée au personnel (0038, jamais un compte portail) --
// même logique que le changement de mot de passe portail (voir portal/change-password/actions.ts).

export async function submitOpportunityInterest(
  supabase: SupabaseClient, // client RLS du portail (createClient())
  admin: SupabaseClient, // client admin (createAdminClient())
  ctx: { organizationId: string; clientId: string; clientName: string; organizationUserId: string | null },
  input: { opportunityId: string; note: string | null }
): Promise<{ created: boolean; interest: ClientOpportunityInterestRow }> {
  const repo = clientOpportunityInterestsRepository(supabase);

  const existing = await repo.findByClientAndOpportunity(ctx.clientId, input.opportunityId);
  if (existing) return { created: false, interest: existing };

  const interest = await repo.create({
    organizationId: ctx.organizationId,
    clientId: ctx.clientId,
    opportunityId: input.opportunityId,
    submittedBy: ctx.organizationUserId,
    note: input.note && input.note.trim().length > 0 ? input.note.trim().slice(0, 2000) : null,
  });

  // Titre relu côté serveur (jamais celui que le formulaire aurait pu fournir) pour que le message de
  // notification soit fiable.
  const { data: opportunity } = await supabase
    .from("funding_opportunities")
    .select("title")
    .eq("id", input.opportunityId)
    .maybeSingle();
  const title = (opportunity as { title: string | null } | null)?.title ?? "une opportunité";

  await notifyStaffOfInterest(admin, ctx, { opportunityId: input.opportunityId, opportunityTitle: title, interestId: interest.id, note: interest.note });

  return { created: true, interest };
}

async function notifyStaffOfInterest(
  admin: SupabaseClient,
  ctx: { organizationId: string; clientId: string; clientName: string },
  info: { opportunityId: string; opportunityTitle: string; interestId: string; note: string | null }
): Promise<void> {
  const { opportunityId, opportunityTitle, interestId, note } = info;
  const message = `${ctx.clientName || "Un client"} a signalé un intérêt pour « ${opportunityTitle} »${note ? ` : ${note}` : ""}`;

  // Priorité au responsable du client (clients.owner_id) s'il est encore un membre actif du
  // personnel ; sinon, diffusion à tous les admins actifs de l'organisation.
  const { data: client } = await admin.from("clients").select("owner_id").eq("id", ctx.clientId).maybeSingle();
  const ownerId = (client as { owner_id: string | null } | null)?.owner_id ?? null;

  let recipientIds: string[] = [];
  if (ownerId) {
    const { data: owner } = await admin
      .from("organization_users")
      .select("id")
      .eq("id", ownerId)
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .in("role", ["admin", "employee"])
      .maybeSingle();
    if (owner) recipientIds = [(owner as { id: string }).id];
  }
  if (recipientIds.length === 0) {
    const { data: admins } = await admin
      .from("organization_users")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .eq("role", "admin");
    recipientIds = (admins ?? []).map((a) => (a as { id: string }).id);
  }

  for (const userId of recipientIds) {
    // ctx.organizationUserId n'a pas de sens ici (l'expéditeur est un compte portail, jamais un
    // destinataire possible) -- notifyUser() ne fait rien de plus avec cette valeur que la comparaison
    // d'auto-notification, qui ne peut jamais matcher un id du personnel.
    await notifyUser(
      admin,
      { organizationId: ctx.organizationId, organizationUserId: "" },
      {
        userId,
        type: "opportunity_interest",
        message,
        href: `/watch/${opportunityId}`,
        entity_type: "client_opportunity_interest",
        entity_id: interestId,
      }
    );
  }
}

export function clientOpportunityInterestsService(supabase: SupabaseClient) {
  const repo = clientOpportunityInterestsRepository(supabase);
  return {
    listByClient: (clientId: string) => repo.listByClient(clientId),
    updateStatus: (id: string, status: OpportunityInterestStatus) => repo.updateStatus(id, status),
  };
}
