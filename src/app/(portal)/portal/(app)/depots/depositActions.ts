"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePortalContext, portalEditRefusal } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { notifyUser } from "@/server/services/notifications.service";
import { subsidyDepositsService } from "@/server/services/subsidyDeposits.service";

// Onglet « Dépôts » du portail (0079, Jade) : le client inscrit un dépôt reçu (date, montant,
// provenance, référence, note) avec sa preuve. Même principe que les autres actions du portail :
// l'accès au dossier est vérifié avec le client RLS normal, l'écriture se fait au client admin.

const BUCKET = "apex-documents";

export type DepositFormState = { error: string | null; message?: string | null };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const schema = z.object({
  grant_project_id: z.string().uuid().nullable(),
  deposit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date du dépôt invalide.").refine((s) => !Number.isNaN(Date.parse(s)), "Date du dépôt invalide."),
  amount: z.number({ invalid_type_error: "Montant reçu invalide." }).min(0.01, "Montant reçu invalide.").max(100_000_000),
  payer: text(150),
  reference: text(150),
  note: text(1000),
});

const parseAmount = (raw: string) => Number(raw.replace(/\s| |\$/g, "").replace(",", "."));

export async function addDepositAction(_prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };

  const rawProject = String(formData.get("grant_project_id") ?? "");
  const parsed = schema.safeParse({
    grant_project_id: rawProject || null,
    deposit_date: String(formData.get("deposit_date") ?? ""),
    amount: parseAmount(String(formData.get("amount") ?? "")),
    payer: String(formData.get("payer") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const input = parsed.data;
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  // Dossier : doit être accessible à ce compte (RLS) ; le dépôt est alors au nom du client du dossier.
  const supabase = await createClient();
  let clientId = ctx.clientId;
  let projectName: string | null = null;
  let ownerId: string | null = null;
  if (input.grant_project_id) {
    const { data: project } = await supabase.from("grant_projects").select("id, client_id, name, owner_id").eq("id", input.grant_project_id).maybeSingle();
    const p = project as unknown as { client_id: string; name: string; owner_id: string | null } | null;
    if (!p) return { error: "Dossier introuvable ou accès refusé." };
    clientId = p.client_id;
    projectName = p.name;
    ownerId = p.owner_id;
  }

  const admin = createAdminClient();
  const db = admin as unknown as SupabaseClient;
  try {
    let documentId: string | null = null;
    if (hasFile) {
      const path = `${ctx.organizationId}/${clientId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;
      const { data: doc, error: docError } = await db
        .from("documents")
        .insert({
          organization_id: ctx.organizationId,
          filename: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size: file.size || null,
          category: "deposit_proof",
          client_id: clientId,
          grant_project_id: input.grant_project_id,
          uploaded_by: ctx.organizationUserId,
          source: "client_portal",
        })
        .select("id")
        .single();
      if (docError) {
        if (/documents_category_check/.test(docError.message ?? "")) throw new Error("L'onglet Dépôts n'est pas encore activé : la migration 0079 doit être passée dans Supabase.");
        throw docError;
      }
      documentId = (doc as { id: string }).id;
    }

    await subsidyDepositsService(db).create({
      organization_id: ctx.organizationId,
      client_id: clientId,
      grant_project_id: input.grant_project_id,
      deposit_date: input.deposit_date,
      amount: Math.round(input.amount * 100) / 100,
      payer: input.payer,
      reference: input.reference,
      note: input.note,
      document_id: documentId,
      created_by: ctx.organizationUserId,
    });

    const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(input.amount);
    if (input.grant_project_id) {
      await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId ?? "" }, {
        grant_project_id: input.grant_project_id,
        client_id: clientId,
        kind: "deposit_recorded_portal",
        title: `Dépôt reçu inscrit par le client : ${money} le ${input.deposit_date}${input.payer ? ` (${input.payer})` : ""}`,
        source: "portal",
        ref_type: documentId ? "document" : null,
        ref_id: documentId,
      });
      await notifyUser(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId }, {
        userId: ownerId,
        type: "ai_review",
        message: `Dépôt reçu inscrit dans le portail (${projectName ?? "dossier"}) : ${money} le ${input.deposit_date}`,
        href: `/grants/${input.grant_project_id}`,
        entity_type: "grant_project",
        entity_id: input.grant_project_id,
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal/depots");
  return { error: null, message: "Dépôt ajouté." };
}

export async function deleteDepositAction(depositId: string): Promise<{ error: string | null }> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  const supabase = await createClient();
  const { data } = await (supabase as unknown as SupabaseClient).from("subsidy_deposits").select("id, grant_project_id").eq("id", depositId).maybeSingle();
  const row = data as unknown as { id: string; grant_project_id: string | null } | null;
  if (!row) return { error: "Dépôt introuvable ou accès refusé." };
  const admin = createAdminClient();
  try {
    await subsidyDepositsService(admin as unknown as SupabaseClient).remove(depositId);
    if (row.grant_project_id) {
      await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId ?? "" }, {
        grant_project_id: row.grant_project_id,
        client_id: ctx.clientId,
        kind: "deposit_deleted_portal",
        title: "Dépôt reçu retiré par le client (la preuve reste dans les documents)",
        source: "portal",
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
  revalidatePath("/portal/depots");
  return { error: null };
}
