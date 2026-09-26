"use server";

import { revalidatePath } from "next/cache";
import { requirePortalContext } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";

const BUCKET = "apex-documents";

export type PortalUploadFormState = { error: string | null };

// Téléverser un fichier pour répondre à une demande de document (document_requests --
// créée par le personnel depuis le dossier, voir grants/[id]/documentRequestActions.ts).
//
// Le rôle "client" n'a aucune permission RLS d'écriture sur documents / document_links /
// document_requests (réservé au personnel, cf. 0016) -- et la policy de stockage
// "apex_documents_write_portal" (0033) ne couvre qu'un autre chemin (program-links), pas
// {organisation}/{client}/... utilisé ici. Plutôt que d'ouvrir des policies larges pour 3
// tables (une policy UPDATE ne peut pas restreindre la RLS à UNE SEULE colonne modifiable :
// un accès RLS "portail peut modifier document_requests" laisserait techniquement
// n'importe quel champ éditable via un appel direct à l'API), cette action :
//   1. vérifie l'accès avec le client normal (RLS -- document_requests_select ->
//      can_access_client, déjà portail-compatible) : si la demande n'est pas visible à ce
//      compte, on s'arrête là ;
//   2. effectue les 3 écritures avec le client admin, strictement sur l'id déjà vérifié.
// Même principe que regeneratePortalPasswordAction / deletePortalAccountAction : le
// service_role sert une écriture précise et vérifiée, jamais une requête ouverte.
export async function uploadRequestedDocumentAction(
  requestId: string,
  _prev: PortalUploadFormState,
  formData: FormData
): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: request, error: findError } = await supabase
    .from("document_requests")
    .select("id, organization_id, client_id, grant_project_id, title")
    .eq("id", requestId)
    .maybeSingle();
  if (findError || !request) {
    return { error: "Demande introuvable ou accès refusé." };
  }

  const admin = createAdminClient();
  try {
    const path = `${request.organization_id}/${request.client_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: orgUserRow } = await admin
      .from("organization_users")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        organization_id: request.organization_id,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size: file.size || null,
        category: "other",
        client_id: request.client_id,
        grant_project_id: request.grant_project_id,
        uploaded_by: orgUserRow?.id ?? null,
        source: "client_portal",
      })
      .select()
      .single();
    if (docError) throw docError;

    const { error: linkError } = await admin
      .from("document_links")
      .insert({
        organization_id: request.organization_id,
        document_id: (doc as { id: string }).id,
        entity_type: "document_request",
        entity_id: requestId,
      });
    if (linkError) throw linkError;

    const { error: statusError } = await admin
      .from("document_requests")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", requestId);
    if (statusError) throw statusError;

    if (request.grant_project_id) {
      await logDossierEvent(admin, { organizationId: request.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
        grant_project_id: request.grant_project_id,
        client_id: request.client_id,
        kind: "document_received_portal",
        title: `Document reçu du client : ${request.title}`,
        source: "portal",
        ref_type: "document_request",
        ref_id: requestId,
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}

// Lien signé pour un document de la bibliothèque (0045). documents_select_portal_full
// permet maintenant au compte portail de lire la LIGNE "documents" (métadonnées) --
// mais la lecture du FICHIER dans le stockage suit une policy séparée
// (apex_documents_read, 0033) qui ne couvre le portail que sur un autre chemin
// (program-links), pas {organisation}/{client}/... utilisé pour ces documents-ci. Même
// principe que le reste du portail : on vérifie l'accès avec le client normal (RLS sur
// la table), puis on génère l'URL signée avec le client admin.
export async function getPortalDocumentUrlAction(documentId: string): Promise<{ url: string | null; error: string | null }> {
  await requirePortalContext();
  const supabase = await createClient();
  const { data: doc, error: findError } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (findError || !doc) {
    return { url: null, error: "Document introuvable ou accès refusé." };
  }

  const admin = createAdminClient();
  try {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error) throw error;
    return { url: data.signedUrl, error: null };
  } catch (e) {
    return { url: null, error: formatCaughtError(e) };
  }
}

// Téléversement de la facture d'un versement de facturation (0054), directement par le compte
// portail -- le client, un compte parent dans la hiérarchie (can_access_grant_project,
// hiérarchie-aware, cf. 0028), ou un compte fournisseur (can_access_grant_project_as_supplier, cf.
// 0047/0049) peuvent tous les trois indiquer que leur facture est faite et la téléverser : les deux
// policies SELECT existantes sur billing_installments couvrent déjà ces trois cas, combinées en OR.
//
// "La facture est faite" est un concept DISTINCT de billing_installments.status
// ('draft'/'submitted', un choix interne à Apex sur l'état de PRÉPARATION du versement, cf. 0042) --
// cette action ne touche jamais `status`, seulement les 3 colonnes client_invoice_* (0054).
//
// billing_installments_update (0042) est réservée au staff -- même principe que
// uploadRequestedDocumentAction : on vérifie l'accès avec le client RLS normal (SELECT, déjà
// portail-compatible), puis on écrit (storage + documents + billing_installments) avec le client
// admin, strictement sur la ligne déjà vérifiée.
export async function uploadInstallmentInvoiceAction(
  installmentId: string,
  _prev: PortalUploadFormState,
  formData: FormData
): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: installment, error: findError } = await supabase
    .from("billing_installments")
    .select("id, organization_id, grant_project_id, installment_number, grant_projects(client_id)")
    .eq("id", installmentId)
    .maybeSingle();
  if (findError || !installment) {
    return { error: "Versement introuvable ou accès refusé." };
  }
  // La jointure grant_projects(client_id) revient en objet (relation *-à-1) -- jamais en
  // tableau -- mais le typage générique de `createClient()` sur une table sans lien déclaré
  // dans database.types.ts (billing_installments n'y figure pas, cf. repositories non typés)
  // ne le sait pas : on relit la valeur en `unknown` plutôt que de forcer un `any` large.
  const clientId = (installment as unknown as { grant_projects: { client_id: string } | null }).grant_projects?.client_id;
  if (!clientId) {
    return { error: "Dossier introuvable." };
  }

  const admin = createAdminClient();
  try {
    const path = `${installment.organization_id}/${clientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: orgUserRow } = await admin
      .from("organization_users")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        organization_id: installment.organization_id,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size: file.size || null,
        category: "invoice",
        client_id: clientId,
        grant_project_id: installment.grant_project_id,
        uploaded_by: orgUserRow?.id ?? null,
        source: "client_portal",
      })
      .select()
      .single();
    if (docError) throw docError;

    // Écrit via le service/repository (client Supabase non typé, cf. billingInstallments.repository.ts)
    // plutôt qu'un appel `.from("billing_installments")` direct sur le client admin typé
    // (`Database`) : les 3 colonnes client_invoice_* sont nouvelles (0054) et n'existent pas dans
    // database.types.ts (généré, non régénérable dans cet environnement) -- même principe que les
    // autres accès à de nouvelles colonnes/tables dans ce projet.
    await billingInstallmentsService(admin).update(installmentId, {
      client_invoice_document_id: (doc as { id: string }).id,
      client_invoice_uploaded_at: new Date().toISOString(),
      client_invoice_uploaded_by: orgUserRow?.id ?? null,
    });

    await logDossierEvent(admin, { organizationId: installment.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
      grant_project_id: installment.grant_project_id,
      client_id: clientId,
      kind: "installment_invoice_received_portal",
      title: `Facture reçue du client pour le versement n°${installment.installment_number}`,
      source: "portal",
      ref_type: "billing_installment",
      ref_id: installmentId,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}

// ---- Statut de paiement des factures fournisseurs (0057) --------------------------------------
// Jade : sur une facture d'un dossier, un statut « Envoyée, non payée » / « Payée », modifiable
// par le personnel ET par le portail (l'enfant lui-même ET son parent, via la hiérarchie déjà en
// place -- can_access_grant_project, cf. 0028). expenses_select n'a aucune restriction
// "personnel seulement" -- le SELECT ci-dessous suffit donc à vérifier l'accès (y compris pour
// un parent sur le dossier d'un enfant) ; expenses_update, lui, exige has_org_role(admin/employee)
// et refuse toujours un compte portail (rôle 'client') -- d'où l'écriture au client admin,
// strictement sur l'id déjà vérifié. Même principe que uploadInstallmentInvoiceAction ci-dessus.
export async function updatePortalInvoicePaymentStatusAction(expenseId: string, status: string): Promise<{ error: string | null }> {
  const ctx = await requirePortalContext();
  if (status !== "sent_unpaid" && status !== "paid") return { error: "Statut de paiement invalide." };

  const supabase = await createClient();
  const { data: expense, error: findError } = await supabase
    .from("expenses")
    .select("id, organization_id, grant_project_id")
    .eq("id", expenseId)
    .maybeSingle();
  if (findError || !expense) {
    return { error: "Facture introuvable ou accès refusé." };
  }

  const admin = createAdminClient();
  try {
    await supplierLedgerService(admin).updatePaymentStatus(expenseId, status, ctx.organizationUserId);
    await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId ?? "" }, {
      grant_project_id: (expense as { grant_project_id: string }).grant_project_id,
      client_id: ctx.clientId,
      kind: "invoice_payment_status_changed_portal",
      title: status === "paid" ? "Facture marquée payée par le client" : "Facture remise à « envoyée, non payée » par le client",
      source: "portal",
      ref_type: "expense",
      ref_id: expenseId,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}

// Téléverser la preuve de paiement d'une facture (Jade). Comme uploadInstallmentInvoiceAction :
// vérifie l'accès avec le client normal, puis téléverse/écrit avec le client admin. Marque aussi
// la facture « Payée » -- envoyer une preuve de paiement veut dire, sans ambiguïté, qu'elle est
// payée, même si le client n'a pas d'abord changé le statut à la main.
export async function uploadInvoicePaymentProofAction(
  expenseId: string,
  _prev: PortalUploadFormState,
  formData: FormData
): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: expense, error: findError } = await supabase
    .from("expenses")
    .select("id, organization_id, grant_project_id, grant_projects(client_id)")
    .eq("id", expenseId)
    .maybeSingle();
  if (findError || !expense) {
    return { error: "Facture introuvable ou accès refusé." };
  }
  const row = expense as unknown as { organization_id: string; grant_project_id: string; grant_projects: { client_id: string } | null };
  const clientId = row.grant_projects?.client_id;
  if (!clientId) {
    return { error: "Dossier introuvable." };
  }

  const admin = createAdminClient();
  try {
    const path = `${row.organization_id}/${clientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        organization_id: row.organization_id,
        filename: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size: file.size || null,
        category: "payment_proof",
        client_id: clientId,
        grant_project_id: row.grant_project_id,
        uploaded_by: ctx.organizationUserId,
        source: "client_portal",
      })
      .select()
      .single();
    if (docError) throw docError;

    const ledger = supplierLedgerService(admin);
    await ledger.setPaymentProof(row.organization_id, expenseId, (doc as { id: string }).id);
    await ledger.updatePaymentStatus(expenseId, "paid", ctx.organizationUserId);

    await logDossierEvent(admin, { organizationId: row.organization_id, organizationUserId: ctx.organizationUserId ?? "" }, {
      grant_project_id: row.grant_project_id,
      client_id: clientId,
      kind: "invoice_payment_proof_uploaded_portal",
      title: "Preuve de paiement reçue du client",
      source: "portal",
      ref_type: "expense",
      ref_id: expenseId,
    });
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}
