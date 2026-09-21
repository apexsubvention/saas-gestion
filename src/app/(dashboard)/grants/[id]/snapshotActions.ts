"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { programSnapshotService } from "@/server/services/programSnapshot.service";
import { logDossierEvent } from "@/server/services/audit";

// Fige les règles ACTUELLES du programme pour ce dossier (nouvelle copie ; les anciennes ne sont jamais modifiées).
export async function takeSnapshotAction(grantProjectId: string): Promise<void> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(grantProjectId);
  if (!project) return;
  try {
    await programSnapshotService(supabase).take(ctx, grantProjectId, project.program_id, "manual");
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "program_snapshot", title: "Règles du programme figées pour ce dossier", source: "manual" });
  } catch {
    /* affiché comme « aucune copie » : le personnel peut réessayer */
  }
  revalidatePath(`/grants/${grantProjectId}`);
}
