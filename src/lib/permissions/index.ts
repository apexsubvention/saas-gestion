// Contexte d'autorisation cote serveur : reflete (sans le remplacer) ce que la RLS
// applique deja en base. Sert a l'UI pour savoir quoi afficher/masquer -- la securite
// reelle reste garantie par Postgres RLS, jamais par ce module seul.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type OrgRole = "admin" | "employee" | "client";

export type OrgContext = {
  userId: string;
  organizationId: string;
  organizationUserId: string;
  role: OrgRole;
  fullName: string | null;
};

// Recupere l'organisation active de l'utilisateur connecte.
// V1 : un utilisateur = une organisation (le multi-org cote UI viendra si besoin reel).
export async function requireOrgContext(): Promise<OrgContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("organization_users")
    .select("id, organization_id, role, full_name")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    redirect("/login?error=no_organization");
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    organizationUserId: membership.id,
    role: membership.role as OrgRole,
    fullName: membership.full_name,
  };
}
