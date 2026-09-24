"use server";

// Changement de mot de passe en libre-service pour un compte portail -- accessible à tout moment
// (pas seulement suggéré à la première connexion, voir portalSignIn) via le lien dans l'en-tête du
// portail. supabase.auth.updateUser() modifie le mot de passe du compte CONNECTÉ (session
// courante) sans avoir besoin de service_role -- mais client_portal_users.current_password (copie en
// clair conservée pour que Jade puisse la retransmettre, 0043) et must_change_password ne sont
// modifiables que par le personnel (RLS 0016) : ces deux champs sont donc mis à jour via le client
// admin, explicitement borné à SA PROPRE ligne (user_id = l'utilisateur de la session courante).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";

export type ChangePortalPasswordFormState = { error: string | null; ok?: boolean };

export async function changePortalPasswordAction(
  _prev: ChangePortalPasswordFormState,
  formData: FormData
): Promise<ChangePortalPasswordFormState> {
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (newPassword.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  try {
    const { error: updateAuthError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateAuthError) throw updateAuthError;

    const admin = createAdminClient();
    const { error: updateRowError } = await admin
      .from("client_portal_users")
      .update({ current_password: newPassword, must_change_password: false })
      .eq("user_id", user.id);
    if (updateRowError) throw updateRowError;
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  return { error: null, ok: true };
}
