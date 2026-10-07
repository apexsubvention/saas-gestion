"use server";

import { revalidatePath } from "next/cache";
import { requirePortalContext, portalEditRefusal } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCaughtError } from "@/lib/errors";
import { logDossierEvent } from "@/server/services/audit";
import { billingInstallmentsService } from "@/server/services/billingInstallments.service";
import { portalInvoiceIntakeService } from "@/server/services/portalInvoiceIntake.service";
import { supplierLedgerService } from "@/server/services/supplierLedger.service";
import { notifyUser } from "@/server/services/notifications.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";

const BUCKET = "apex-documents";

// Jade (0066) : « ajouter un notif pour m'avertir quand la facture est payée » -- déclenché
// seulement quand le CLIENT (portail) marque une facture payée, jamais quand le personnel le fait
// lui-même en interne (supplierActions.ts -- il le sait déjà, il vient de le faire). Notifie le
// propriétaire du dossier (owner_id), même mécanisme que "Convention lue"/"tâche assignée" --
// visible dans la cloche de notifications du personnel, avant même d'ouvrir le dossier concerné.
// `admin` (service role) obligatoire : notifications_insert_staff (0038) exige
// is_org_staff(organization_id), qu'un compte portail (rôle 'client') ne remplit jamais -- voir
// notifications.service.ts.
async function notifyInvoicePaid(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { organizationId: string; organizationUserId: string | null; clientName: string },
  expense: { id: string; grant_project_id: string; supplier_id: string | null; total: number | null; subtotal: number | null }
): Promise<void> {
  const [{ data: project }, { data: supplier }] = await Promise.all([
    admin.from("grant_projects").select("name, owner_id").eq("id", expense.grant_project_id).maybeSingle(),
    expense.supplier_id
      ? admin.from("project_suppliers").select("name").eq("id", expense.supplier_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);
  const projectRow = project as { name: string; owner_id: string | null } | null;
  const supplierName = (supplier as { name: string } | null)?.name ?? null;
  const amount = expense.total ?? expense.subtotal;
  const amountText = amount != null ? ` (${Number(amount).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })})` : "";
  await notifyUser(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId }, {
    userId: projectRow?.owner_id ?? null,
    type: "invoice_paid",
    message: `Facture${supplierName ? ` de ${supplierName}` : ""} marquée payée par ${ctx.clientName}${amountText} — ${projectRow?.name ?? "dossier"}.`,
    href: `/grants/${expense.grant_project_id}`,
    entity_type: "expense",
    entity_id: expense.id,
  });
}

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
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: requestRaw, error: findError } = await supabase
    .from("document_requests")
    .select("id, organization_id, client_id, grant_project_id, title, supplier_id")
    .eq("id", requestId)
    .maybeSingle();
  if (findError || !requestRaw) {
    return { error: "Demande introuvable ou accès refusé." };
  }
  // client_id/supplier_id (0070) sont absentes/désynchronisées de database.types.ts (généré, non
  // régénérable dans cet environnement -- même limitation documentée sur payment_status, 0057) :
  // passage par `unknown` avant le cast, sinon TypeScript refuse la conversion directe (build
  // cassé chez Jade -- 0067/0069).
  const request = requestRaw as unknown as {
    id: string;
    organization_id: string;
    client_id: string | null;
    grant_project_id: string | null;
    title: string;
    supplier_id: string | null;
  };

  const admin = createAdminClient();
  try {
    // 0070 -- une demande attribuée à un fournisseur n'a pas de client_id (voir migration 0070) :
    // on retombe sur le client Apex lié à ce fournisseur (project_suppliers.supplier_client_id) --
    // toujours renseigné ici, resolveDocumentRequestTarget refuse un fournisseur sans compte
    // portail (donc sans supplier_client_id) à la création.
    let effectiveClientId = request.client_id;
    if (!effectiveClientId && request.supplier_id) {
      const { data: supplierRow } = await admin.from("project_suppliers").select("supplier_client_id").eq("id", request.supplier_id).maybeSingle();
      effectiveClientId = (supplierRow as { supplier_client_id: string | null } | null)?.supplier_client_id ?? null;
    }
    if (!effectiveClientId) {
      return { error: "Impossible de déterminer le client pour ce document." };
    }
    const path = `${request.organization_id}/${effectiveClientId}/${Date.now()}-${file.name}`;
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
        client_id: effectiveClientId,
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
        client_id: effectiveClientId,
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

// Marquer une tâche comme faite SANS fichier (0067 -- Jade : « ce n'est pas chaque tâche
// demandée qui va devoir avoir un document à téléverser »). Même demande (document_requests)
// que uploadRequestedDocumentAction ci-dessus, mais requires_upload = false : on saute le
// storage/documents/document_links et on passe directement au même statut "received" (repris tel
// quel côté personnel -- une tâche « à valider » se traite comme un document reçu « à valider »,
// mêmes contrôles de statut déjà en place, DOCUMENT_REQUEST_STATUS_OPTIONS inchangé).
export async function markDocumentRequestDoneAction(requestId: string): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };

  const supabase = await createClient();
  const { data: request, error: findError } = await supabase
    .from("document_requests")
    .select("id, organization_id, client_id, grant_project_id, title, requires_upload, status")
    .eq("id", requestId)
    .maybeSingle();
  if (findError || !request) {
    return { error: "Demande introuvable ou accès refusé." };
  }
  if (request.requires_upload) {
    return { error: "Cette tâche nécessite un fichier à téléverser." };
  }

  const admin = createAdminClient();
  try {
    const { data: orgUserRow } = await admin
      .from("organization_users")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const { error: statusError } = await admin
      .from("document_requests")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", requestId);
    if (statusError) throw statusError;

    if (request.grant_project_id) {
      await logDossierEvent(admin, { organizationId: request.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
        grant_project_id: request.grant_project_id,
        client_id: request.client_id,
        kind: "task_done_portal",
        title: `Tâche marquée faite par le client : ${request.title}`,
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
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
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
    const updatedInstallment = await billingInstallmentsService(admin).update(installmentId, {
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

    // Jade (0073) : lecture automatique de la facture -> ligne pré-remplie (n°, document, date,
    // montant avant taxes) sous le bon fournisseur dans le tableau du dossier, à approuver ; les
    // incohérences avec le versement prévu sont notées avec un brouillon de note au client.
    // Best-effort : la facture du client est déjà enregistrée -- un échec ici ne le concerne pas
    // (le personnel peut relancer la lecture depuis le dossier).
    try {
      const r = await portalInvoiceIntakeService(admin).processInstallment({ organizationId: installment.organization_id }, updatedInstallment);
      if (r.status !== "skipped") {
        await logDossierEvent(admin, { organizationId: installment.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
          grant_project_id: installment.grant_project_id,
          client_id: clientId,
          kind: "installment_invoice_read",
          title: `Facture du versement n°${installment.installment_number} lue et ajoutée au tableau Fournisseurs${r.issues > 0 ? ` -- ${r.issues} incohérence(s) à vérifier` : " -- à approuver"}`,
          source: "ai",
          ref_type: "expense",
          ref_id: r.expenseId,
        });
        const { data: owner } = await admin.from("grant_projects").select("owner_id, name").eq("id", installment.grant_project_id).maybeSingle();
        const o = owner as { owner_id: string | null; name: string } | null;
        await notifyUser(admin, { organizationId: installment.organization_id, organizationUserId: orgUserRow?.id ?? null }, {
          userId: o?.owner_id ?? null,
          type: "ai_review",
          message: `Facture reçue du portail (versement n°${installment.installment_number}, ${o?.name ?? "dossier"}) : ${r.issues > 0 ? `${r.issues} incohérence(s), note au client prête` : "pré-remplie, à approuver"}`,
          href: `/grants/${installment.grant_project_id}`,
          entity_type: "grant_project",
          entity_id: installment.grant_project_id,
        });
      }
    } catch {
      // Best-effort -- voir plus haut.
    }
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
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  if (status !== "sent_unpaid" && status !== "paid") return { error: "Statut de paiement invalide." };

  const supabase = await createClient();
  const { data: expense, error: findError } = await supabase
    .from("expenses")
    .select("id, organization_id, grant_project_id, supplier_id, total, subtotal, payment_status")
    .eq("id", expenseId)
    .maybeSingle();
  if (findError || !expense) {
    return { error: "Facture introuvable ou accès refusé." };
  }
  // payment_status (0057) est absente de database.types.ts (généré, non régénérable dans cet
  // environnement -- même limitation documentée plus bas pour uploadInvoicePaymentProofAction) :
  // le SELECT typé la renvoie comme SelectQueryError, d'où le passage par `unknown` avant le cast,
  // sinon TypeScript refuse la conversion directe (build cassé chez Jade -- 0067).
  const expenseRow = expense as unknown as { id: string; grant_project_id: string; supplier_id: string | null; total: number | null; subtotal: number | null; payment_status: string };

  const admin = createAdminClient();
  try {
    await supplierLedgerService(admin).updatePaymentStatus(expenseId, status, ctx.organizationUserId);
    await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId ?? "" }, {
      grant_project_id: expenseRow.grant_project_id,
      client_id: ctx.clientId,
      kind: "invoice_payment_status_changed_portal",
      title: status === "paid" ? "Facture marquée payée par le client" : "Facture remise à « envoyée, non payée » par le client",
      source: "portal",
      ref_type: "expense",
      ref_id: expenseId,
    });
    // Notif (0066) : seulement sur la vraie transition vers "payée" -- pas si c'était déjà le cas
    // (re-choisir la même option ne doit pas renotifier), jamais sur le retour à "non payée".
    if (status === "paid" && expenseRow.payment_status !== "paid") {
      await notifyInvoicePaid(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId, clientName: ctx.clientName }, expenseRow);
    }
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
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier." };
  }

  const supabase = await createClient();
  const { data: expense, error: findError } = await supabase
    .from("expenses")
    .select("id, organization_id, grant_project_id, supplier_id, total, subtotal, payment_status, grant_projects(client_id)")
    .eq("id", expenseId)
    .maybeSingle();
  if (findError || !expense) {
    return { error: "Facture introuvable ou accès refusé." };
  }
  const row = expense as unknown as {
    id: string;
    organization_id: string;
    grant_project_id: string;
    supplier_id: string | null;
    total: number | null;
    subtotal: number | null;
    payment_status: string;
    grant_projects: { client_id: string } | null;
  };
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
    // Notif (0066) : même garde que updatePortalInvoicePaymentStatusAction -- seulement sur la
    // vraie transition vers "payée" (une preuve reçue pour une facture déjà "payée" ne renotifie pas).
    if (row.payment_status !== "paid") {
      await notifyInvoicePaid(admin, { organizationId: row.organization_id, organizationUserId: ctx.organizationUserId, clientName: ctx.clientName }, row);
    }

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

// Marquer une tâche (table tasks, 0069) comme faite depuis le portail -- client visé OU
// fournisseur inscrit visé, même bouton (PortalTaskCard.tsx) des deux côtés. Même schéma que
// markDocumentRequestDoneAction ci-dessus : le select initial (client RLS normal) sert à
// vérifier l'accès via tasks_portal_select (0069) -- il échoue silencieusement (row = null) si
// ce compte n'est pas la cible visible de cette tâche -- puis l'écriture passe par le service
// role (une tâche n'a pas de policy update portail, exactement comme document_requests).
export async function markTaskDoneAction(taskId: string): Promise<PortalUploadFormState> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };

  const supabase = await createClient();
  const { data: task, error: findError } = await supabase
    .from("tasks")
    .select("id, organization_id, client_id, grant_project_id, title, status")
    .eq("id", taskId)
    .maybeSingle();
  if (findError || !task) {
    return { error: "Tâche introuvable ou accès refusé." };
  }
  if (task.status === "done") {
    return { error: null };
  }

  const admin = createAdminClient();
  try {
    const { data: orgUserRow } = await admin
      .from("organization_users")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const { error: statusError } = await admin.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", taskId);
    if (statusError) throw statusError;

    if (task.grant_project_id) {
      await logDossierEvent(admin, { organizationId: task.organization_id, organizationUserId: orgUserRow?.id ?? "" }, {
        grant_project_id: task.grant_project_id,
        client_id: task.client_id,
        kind: "task_done_portal",
        title: `Tâche marquée faite par le client : ${task.title}`,
        source: "portal",
        ref_type: "task",
        ref_id: taskId,
      });
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}

// ---- Opportunité à confirmer (0071, Jade, chantier 2) ---------------------------
// Le client répond intéressé / ne convient pas à une opportunité posée sur SON dossier
// (grant_projects.status === "opportunity_to_confirm") -- même principe que le reste de ce
// fichier : vérifie l'accès avec le client normal (RLS -- grant_projects_select, déjà portail-
// compatible), puis écrit avec le client admin (pas de policy UPDATE portail sur grant_projects).
async function notifyOpportunityResponse(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { organizationId: string; organizationUserId: string | null; clientName: string },
  project: { id: string; name: string; owner_id: string | null },
  response: "interested" | "not_interested"
): Promise<void> {
  await notifyUser(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId }, {
    userId: project.owner_id,
    type: "opportunity_response",
    message: `${ctx.clientName} a répondu à propos d'une opportunité : ${response === "interested" ? "intéressé" : "ne convient pas"} — ${project.name}.`,
    href: `/grants/${project.id}`,
    entity_type: "grant_project",
    entity_id: project.id,
  });
}

export async function respondToOpportunityAction(grantProjectId: string, response: "interested" | "not_interested"): Promise<{ error: string | null }> {
  const ctx = await requirePortalContext();
  const refusal = portalEditRefusal(ctx);
  if (refusal) return { error: refusal };
  if (response !== "interested" && response !== "not_interested") return { error: "Réponse invalide." };

  const supabase = await createClient();
  const { data: project, error: findError } = await supabase
    .from("grant_projects")
    .select("id, name, owner_id, status, client_opportunity_response")
    .eq("id", grantProjectId)
    .maybeSingle();
  if (findError || !project) {
    return { error: "Dossier introuvable ou accès refusé." };
  }
  // client_opportunity_response (0071) est absente de database.types.ts (généré, non
  // régénérable ici) -- même contournement que payment_status/uploadRequestedDocumentAction
  // (build cassé chez Jade -- 0067) : passage par `unknown` avant le cast.
  const projectRow = project as unknown as { id: string; name: string; owner_id: string | null; status: string; client_opportunity_response: "interested" | "not_interested" | null };
  if (projectRow.status !== "opportunity_to_confirm") {
    return { error: "Ce dossier n'est plus à l'étape « Opportunité à confirmer »." };
  }

  const admin = createAdminClient();
  try {
    await grantProjectsService(admin).updateClientOpportunityResponse(grantProjectId, response);
    await logDossierEvent(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId ?? "" }, {
      grant_project_id: grantProjectId,
      client_id: ctx.clientId,
      kind: "opportunity_response_submitted",
      title: response === "interested" ? "Client : l'opportunité l'intéresse" : "Client : l'opportunité ne convient pas",
      source: "portal",
      ref_type: "grant_project",
      ref_id: grantProjectId,
    });
    // Notif seulement sur une vraie transition -- pas si le client re-choisit la même réponse.
    if (projectRow.client_opportunity_response !== response) {
      await notifyOpportunityResponse(admin, { organizationId: ctx.organizationId, organizationUserId: ctx.organizationUserId, clientName: ctx.clientName }, projectRow, response);
    }
  } catch (e) {
    return { error: formatCaughtError(e) };
  }

  revalidatePath("/portal");
  return { error: null };
}
