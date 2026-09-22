"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { deleteGrantProjectService } from "@/server/services/deleteGrantProject.service";
import { logAudit } from "@/server/services/audit";

export type DeleteGrantProjectResult = { error: string | null };

const uuid = z.string().uuid();

// Suppression définitive d'un dossier (documents, entente, réclamations, échéances, tâches,
// fournisseurs, questionnaire, journal, tout). Réservée aux admins : voir deleteGrantProject.service.ts.
// confirmName doit correspondre EXACTEMENT au nom du dossier -- deuxième ligne de défense en plus de la
// confirmation du navigateur, pour un clic qui ne peut pas être annulé.
export async function deleteGrantProjectAction(grantProjectId: string, confirmName: string): Promise<DeleteGrantProjectResult> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") return { error: "Seul un administrateur peut supprimer un dossier." };
  if (!uuid.safeParse(grantProjectId).success) return { error: "Dossier invalide." };

  const supabase = await createClient();
  const service = deleteGrantProjectService(supabase);
  try {
    const preview = await service.preview(grantProjectId);
    if (!preview) return { error: "Dossier introuvable." };
    if (confirmName.trim() !== preview.name) return { error: "Le nom saisi ne correspond pas au nom du dossier." };

    const removed = await service.remove(grantProjectId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };

    // Journalisé au niveau de l'organisation (audit_logs n'a pas de lien vers grant_projects donc
    // n'est pas emporté par la cascade) : trace de qui a supprimé quoi, même après coup.
    await logAudit(supabase, ctx, {
      action: "grant_project_deleted",
      entity_type: "grant_project",
      entity_id: grantProjectId,
      before: preview,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/grants");
  revalidatePath("/echeancier");
  revalidatePath("/taches");
  return { error: null };
}

// Variante utilisée DEPUIS la page du dossier (redirige vers la liste au lieu de revalider sur place,
// vu que la page qu'on affichait vient de disparaître).
export async function deleteGrantProjectAndRedirectAction(grantProjectId: string, confirmName: string): Promise<DeleteGrantProjectResult> {
  const r = await deleteGrantProjectAction(grantProjectId, confirmName);
  if (r.error) return r;
  redirect("/grants");
}
