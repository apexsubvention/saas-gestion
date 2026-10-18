"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { documentRequestsService } from "@/server/services/documentRequests.service";
import { analyzableMime, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";
import { buildServicesQuebecGuideText, draftServicesQuebecGuide } from "@/features/mfor/servicesQuebecGuide";
import { resolveDocumentRequestTarget } from "./documentRequestTargetResolve";

// MFOR -- « Marche à suivre Services Québec » (Jade) : générer le texte à partir de l'offre de
// service, puis créer la tâche dans le portail du client (« Tâches à faire pour le client »,
// sans fichier à fournir -- le client coche la tâche une fois l'appel fait).

const BUCKET = "apex-documents";

export type MforGuideResult = { error: string | null; text?: string };

export async function generateMforGuideAction(
  grantProjectId: string,
  input: { offerText: string; documentId: string | null; phone: string; officeName: string }
): Promise<MforGuideResult> {
  await requireOrgContext();
  const supabase = await createClient();
  try {
    const { data: project } = await supabase.from("grant_projects").select("name, clients(name)").eq("id", grantProjectId).maybeSingle();
    if (!project) return { error: "Dossier introuvable." };
    const p = project as unknown as { name: string; clients: { name: string } | null };

    let offerFile: { bytes: ArrayBuffer; mime: string } | null = null;
    if (input.documentId) {
      const { data: doc } = await supabase.from("documents").select("filename, storage_path, size, grant_project_id").eq("id", input.documentId).maybeSingle();
      const d = doc as unknown as { filename: string; storage_path: string; size: number | null; grant_project_id: string | null } | null;
      if (!d || d.grant_project_id !== grantProjectId) return { error: "Document introuvable dans ce dossier." };
      const mime = analyzableMime(d.filename);
      if (!mime) return { error: "Ce document ne peut pas être lu automatiquement (PDF ou image seulement) : colle plutôt le texte de l'offre." };
      if (d.size != null && d.size > MAX_INVOICE_BYTES) return { error: "Document trop volumineux pour la lecture automatique (4 Mo max) : colle plutôt le texte de l'offre." };
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(d.storage_path);
      if (error || !blob) return { error: "Impossible d'ouvrir le document." };
      offerFile = { bytes: await blob.arrayBuffer(), mime };
    }

    const draft = await draftServicesQuebecGuide({ clientName: p.clients?.name ?? "l'entreprise", projectName: p.name, offerText: input.offerText || null, offerFile });
    if (draft.needs.length === 0) return { error: "Aucun besoin de formation n'a pu être dégagé de l'offre : vérifie le texte ou le document." };
    return { error: null, text: buildServicesQuebecGuideText({ phone: input.phone, officeName: input.officeName, needs: draft.needs, avoid: draft.avoid }) };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function createMforGuideTaskAction(
  grantProjectId: string,
  clientId: string,
  input: { title: string; text: string; dueDate: string | null }
): Promise<MforGuideResult> {
  const ctx = await requireOrgContext();
  const title = input.title.trim();
  const text = input.text.trim();
  if (!title) return { error: "Le titre de la tâche est requis." };
  if (!text) return { error: "Génère ou écris d'abord la marche à suivre." };
  const dueDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;
  const supabase = await createClient();
  try {
    const target = await resolveDocumentRequestTarget(supabase, { grantProjectId, dossierClientId: clientId, targetRaw: `client:${clientId}` });
    if ("error" in target) return { error: target.error };
    const created = await documentRequestsService(supabase).create(ctx.organizationId, {
      client_id: target.client_id,
      target_kind: target.target_kind,
      supplier_id: target.supplier_id,
      grant_project_id: grantProjectId,
      claim_id: null,
      document_type: "other",
      title: title.slice(0, 300),
      instructions: text.slice(0, 6000),
      due_date: dueDate,
      requires_upload: false,
    });
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      client_id: target.client_id,
      kind: "document_requested",
      title: `Tâche demandée au client : ${title}`,
      source: "manual",
      ref_type: "document_request",
      ref_id: created.id,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath(`/grants/${grantProjectId}`);
  return { error: null };
}
