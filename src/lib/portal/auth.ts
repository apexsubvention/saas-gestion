// Contexte d'autorisation pour le portail client -- équivalent de
// src/lib/permissions/index.ts (requireOrgContext) mais pour un compte portail
// (organization_users.role = 'client', voir 0028_client_hierarchy_and_portal_access.sql)
// plutôt qu'un membre du staff. Redirige vers /portal/login, jamais /login.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type PortalContext = {
  userId: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  fullName: string | null;
  // organization_users.id de ce compte (role = 'client') -- nécessaire pour toute
  // écriture RLS qui utilise current_org_user_id()/author_org_user_id (ex. dossier_notes,
  // 0046). Normalement toujours présent (chaque compte portail a une ligne
  // organization_users en plus de sa ligne client_portal_users -- voir 0028) ; nullable
  // ici par prudence défensive seulement.
  organizationUserId: string | null;
};

export async function requirePortalContext(): Promise<PortalContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const { data: portalUser, error } = await supabase
    .from("client_portal_users")
    .select("client_id, organization_id, active, clients(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error || !portalUser) {
    redirect("/portal/login?error=no_access");
  }

  const { data: orgUser } = await supabase
    .from("organization_users")
    .select("id, full_name")
    .eq("user_id", user.id)
    .eq("organization_id", portalUser.organization_id)
    .maybeSingle();

  return {
    userId: user.id,
    organizationId: portalUser.organization_id,
    clientId: portalUser.client_id,
    clientName: (portalUser as unknown as { clients: { name: string } | null }).clients?.name ?? "",
    fullName: orgUser?.full_name ?? null,
    organizationUserId: orgUser?.id ?? null,
  };
}
