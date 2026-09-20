"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { documentsService } from "@/server/services/documents.service";
import { clientsService } from "@/server/services/clients.service";
import { requireOrgContext } from "@/lib/permissions";

// Duplique volontairement le formatage d'erreur de src/server/import/importApexClients.ts
// plutôt que de le partager : une erreur Supabase brute (PostgrestError/AuthError) n'est
// pas une instance d'Error, donc String(e) donne "[object Object]" -- voir ce fichier pour
// le contexte complet du bug d'origine.
function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code].filter(
      (v) => typeof v === "string" && v.length > 0
    );
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erreur non sérialisable.";
    }
  }
  return String(e);
}

function generateTempPassword(): string {
  // Mot de passe temporaire à usage unique que Jade transmet elle-même à la personne
  // (aucun envoi de courriel automatique -- voir la décision "brouillon seulement, pas
  // d'envoi Gmail" prise plus tôt dans ce projet). La personne peut le changer une fois
  // connectée via le flux Supabase standard si elle le souhaite.
  return randomBytes(12).toString("base64url");
}

export type UploadDocumentFormState = { error: string | null };

export type UpdateClientNeedsFormState = { error: string | null; savedAt: string | null };

export async function updateClientNeedsAction(
  clientId: string,
  _prev: UpdateClientNeedsFormState,
  formData: FormData
): Promise<UpdateClientNeedsFormState> {
  const ctx = await requireOrgContext();
  const currentNeeds = String(formData.get("current_needs") ?? "");

  const supabase = await createClient();
  try {
    await clientsService(supabase).updateNeeds(clientId, ctx.organizationUserId, {
      current_needs: currentNeeds,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'enregistrement", savedAt: null };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null, savedAt: new Date().toISOString() };
}

export async function uploadDocumentAction(
  clientId: string,
  _prev: UploadDocumentFormState,
  formData: FormData
): Promise<UploadDocumentFormState> {
  const ctx = await requireOrgContext();
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "other");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  try {
    await documentsService(supabase).upload({
      organizationId: ctx.organizationId,
      clientId,
      uploadedBy: ctx.organizationUserId,
      category,
      file,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload" };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

// ---- Hiérarchie client (parent / enfants) --------------------------------------
// Voir supabase/migrations/0028_client_hierarchy_and_portal_access.sql -- un accès
// portail accordé sur le parent se propage automatiquement à ses enfants via
// can_access_client(), donc pas d'autre action à faire ici que poser la relation.

export type SetClientParentFormState = { error: string | null };

export async function setClientParentAction(
  clientId: string,
  _prev: SetClientParentFormState,
  formData: FormData
): Promise<SetClientParentFormState> {
  await requireOrgContext();
  const parentClientIdRaw = String(formData.get("parent_client_id") ?? "");
  const parentClientId = parentClientIdRaw.length > 0 ? parentClientIdRaw : null;

  const supabase = await createClient();
  try {
    await clientsService(supabase).setParent(clientId, parentClientId);
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

// ---- Compte portail -------------------------------------------------------------
// Provisionnement : crée un utilisateur Supabase Auth + son appartenance à
// l'organisation (rôle "client", accès limité par client_access) + l'enregistrement
// client_portal_users qui sert de registre/interrupteur pour le portail. Utilise
// service_role car la création d'un utilisateur Supabase Auth n'est possible que via
// l'API admin -- voir src/lib/supabase/admin.ts. Réservé aux admins, vérifié
// explicitement AVANT toute création, comme pour l'import bulk.

export type CreatePortalAccountFormState = {
  error: string | null;
  createdEmail: string | null;
  tempPassword: string | null;
};

export async function createPortalAccountAction(
  clientId: string,
  _prev: CreatePortalAccountFormState,
  formData: FormData
): Promise<CreatePortalAccountFormState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") {
    return { error: "Réservé aux administrateurs.", createdEmail: null, tempPassword: null };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return { error: "Courriel valide requis.", createdEmail: null, tempPassword: null };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  try {
    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createUserError) throw createUserError;
    const authUserId = created.user.id;

    const { data: orgUserRow, error: orgUserError } = await admin
      .from("organization_users")
      .insert({
        organization_id: ctx.organizationId,
        user_id: authUserId,
        role: "client",
        full_name: fullName,
        email,
        active: true,
      })
      .select()
      .single();
    if (orgUserError) throw orgUserError;

    const { error: accessError } = await admin.from("client_access").insert({
      organization_id: ctx.organizationId,
      client_id: clientId,
      user_id: (orgUserRow as { id: string }).id,
    });
    if (accessError) throw accessError;

    const { error: portalError } = await admin.from("client_portal_users").insert({
      organization_id: ctx.organizationId,
      client_id: clientId,
      user_id: authUserId,
      active: true,
    });
    if (portalError) throw portalError;
  } catch (e) {
    return { error: formatCaughtError(e), createdEmail: null, tempPassword: null };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null, createdEmail: email, tempPassword };
}

export type SetPortalAccountActiveFormState = { error: string | null };

export async function setPortalAccountActiveAction(
  clientId: string,
  portalUserRowId: string,
  active: boolean
): Promise<void> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") return;

  const supabase = await createClient();
  await supabase.from("client_portal_users").update({ active }).eq("id", portalUserRowId);
  revalidatePath(`/clients/${clientId}`);
}
