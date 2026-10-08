import type { SupabaseClient } from "@supabase/supabase-js";
import { documentsRepository } from "@/server/repositories/documents.repository";
import {
  activitySentence,
  factsFromEvent,
  noteExcerpt,
  relationOf,
  type ActivityActor,
  type ActivityDossierClient,
} from "@/features/portal/activitySentence";

// Résumé de l'activité des clients dans le portail (0076, Jade) -- onglet Dossiers du portail
// admin. Sources déjà existantes, jamais modifiées ici :
//  - dossier_events.source = 'portal' (factures de versement, documents, tâches faites, statut et
//    preuve de paiement, réponse à une opportunité) -- created_by = la personne qui a agi ;
//  - dossier_notes.author_role = 'client' (notes écrites par les clients).
// « Traité » est retenu à part (portal_activity_handled). Tout passe par le client RLS du
// personnel : on ne voit que les dossiers auxquels on a accès.

export type PortalActivityItem = {
  key: string; // `${refKind}:${refId}`
  refKind: "event" | "note";
  refId: string;
  occurredAt: string;
  sentence: string;
  grantProjectId: string | null;
  dossierName: string | null;
  handledAt: string | null;
};

const DAYS_BACK = 60;
const MAX_ITEMS = 150;

type EventRow = { id: string; grant_project_id: string | null; client_id: string | null; kind: string; title: string; ref_type: string | null; ref_id: string | null; occurred_at: string; created_by: string | null };
type NoteRow = { id: string; grant_project_id: string; client_id: string; author_org_user_id: string; author_name: string; body: string; created_at: string };

const uniq = <T,>(xs: Array<T | null | undefined>) => [...new Set(xs.filter((x): x is T => x != null))];

export function portalActivityService(supabase: SupabaseClient) {
  const documentsRepo = documentsRepository(supabase);

  async function select<T>(table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from(table).select(columns).in(column, ids);
    if (error) throw error;
    return (data ?? []) as unknown as T[];
  }

  return {
    async listRecent(): Promise<PortalActivityItem[]> {
      const since = new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();
      const [eventsRes, notesRes, handledRes] = await Promise.all([
        supabase
          .from("dossier_events")
          .select("id, grant_project_id, client_id, kind, title, ref_type, ref_id, occurred_at, created_by")
          .eq("source", "portal")
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false })
          .limit(MAX_ITEMS),
        supabase
          .from("dossier_notes")
          .select("id, grant_project_id, client_id, author_org_user_id, author_name, body, created_at")
          .eq("author_role", "client")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(MAX_ITEMS),
        // Table 0076 : absente tant que la migration n'est pas passée -> aucune ligne « traitée ».
        supabase.from("portal_activity_handled").select("ref_kind, ref_id, handled_at"),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (notesRes.error) throw notesRes.error;
      const events = (eventsRes.data ?? []) as unknown as EventRow[];
      const notes = (notesRes.data ?? []) as unknown as NoteRow[];
      const handledRows = ((handledRes.error ? [] : handledRes.data) ?? []) as Array<{ ref_kind: string; ref_id: string; handled_at: string }>;
      const handled = new Map<string, string>(handledRows.map((h) => [`${h.ref_kind}:${h.ref_id}`, h.handled_at] as [string, string]));

      // Qui a agi : organization_users -> client_portal_users -> clients.
      const actorOrgUserIds = uniq([...events.map((e) => e.created_by), ...notes.map((n) => n.author_org_user_id)]);
      const orgUsers = await select<{ id: string; user_id: string; full_name: string | null; email: string | null }>("organization_users", "id, user_id, full_name, email", "id", actorOrgUserIds);
      const portalUsers = await select<{ user_id: string; client_id: string }>("client_portal_users", "user_id, client_id", "user_id", uniq(orgUsers.map((u) => u.user_id)));
      const clientByAuthUser = new Map(portalUsers.map((p) => [p.user_id, p.client_id]));

      // Dossiers concernés, leur client et les clients-fournisseurs de chaque dossier.
      const projectIds = uniq([...events.map((e) => e.grant_project_id), ...notes.map((n) => n.grant_project_id)]);
      const [projects, suppliers] = await Promise.all([
        select<{ id: string; name: string; client_id: string }>("grant_projects", "id, name, client_id", "id", projectIds),
        select<{ grant_project_id: string; supplier_client_id: string | null }>("project_suppliers", "grant_project_id, supplier_client_id", "grant_project_id", projectIds),
      ]);
      const clientIds = uniq([...projects.map((p) => p.client_id), ...portalUsers.map((p) => p.client_id)]);
      const clients = await select<{ id: string; name: string; parent_client_id: string | null }>("clients", "id, name, parent_client_id", "id", clientIds);
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const supplierClientsByProject = new Map<string, string[]>();
      for (const s of suppliers) {
        if (!s.supplier_client_id) continue;
        supplierClientsByProject.set(s.grant_project_id, [...(supplierClientsByProject.get(s.grant_project_id) ?? []), s.supplier_client_id]);
      }

      // Noms de fichiers / numéros de versement, groupés par type de référence.
      const refIds = (type: string) => uniq(events.filter((e) => e.ref_type === type).map((e) => e.ref_id));
      const [installments, requestLinks, sharedDocs, proofLinks] = await Promise.all([
        select<{ id: string; installment_number: number; client_invoice_document_id: string | null }>("billing_installments", "id, installment_number, client_invoice_document_id", "id", refIds("billing_installment")),
        refIds("document_request").length ? documentsRepo.listDocumentRequestLinks(refIds("document_request")) : Promise.resolve([]),
        select<{ id: string; filename: string }>("documents", "id, filename", "id", refIds("document")),
        refIds("expense").length ? documentsRepo.listPaymentProofLinks(refIds("expense")) : Promise.resolve([]),
      ]);
      const installmentDocs = await select<{ id: string; filename: string }>("documents", "id, filename", "id", uniq(installments.map((i) => i.client_invoice_document_id)));
      const filenameByDocId = new Map([...sharedDocs, ...installmentDocs].map((d) => [d.id, d.filename]));
      const installmentById = new Map(installments.map((i) => [i.id, i]));
      const requestFile = new Map(requestLinks.map((l) => [l.request_id, l.filename]));
      const proofFile = new Map(proofLinks.map((l) => [l.expense_id, l.filename]));

      function actorFor(orgUserId: string | null, fallbackName: string | null): ActivityActor {
        const u = orgUsers.find((x) => x.id === orgUserId);
        const clientId = u ? (clientByAuthUser.get(u.user_id) ?? null) : null;
        return { clientId, clientName: clientId ? (clientById.get(clientId)?.name ?? null) : null, personName: u?.full_name ?? u?.email ?? fallbackName };
      }
      function dossierClientFor(projectId: string | null): ActivityDossierClient | null {
        const p = projectId ? projectById.get(projectId) : undefined;
        const c = p ? clientById.get(p.client_id) : undefined;
        return c ? { id: c.id, name: c.name, parentClientId: c.parent_client_id } : null;
      }

      const items: PortalActivityItem[] = [];
      for (const e of events) {
        const actor = actorFor(e.created_by, null);
        let extra: { installmentNumber?: number | null; filename?: string | null } = {};
        if (e.ref_type === "billing_installment" && e.ref_id) {
          const inst = installmentById.get(e.ref_id);
          extra = { installmentNumber: inst?.installment_number ?? null, filename: inst?.client_invoice_document_id ? (filenameByDocId.get(inst.client_invoice_document_id) ?? null) : null };
        } else if (e.ref_type === "document_request" && e.ref_id) extra = { filename: requestFile.get(e.ref_id) ?? null };
        else if (e.ref_type === "document" && e.ref_id) extra = { filename: filenameByDocId.get(e.ref_id) ?? null };
        else if (e.ref_type === "expense" && e.ref_id && e.kind === "invoice_payment_proof_uploaded_portal") extra = { filename: proofFile.get(e.ref_id) ?? null };
        const relation = relationOf(actor, dossierClientFor(e.grant_project_id), e.grant_project_id ? (supplierClientsByProject.get(e.grant_project_id) ?? []) : []);
        items.push({
          key: `event:${e.id}`,
          refKind: "event",
          refId: e.id,
          occurredAt: e.occurred_at,
          sentence: activitySentence(actor, factsFromEvent(e, extra), relation),
          grantProjectId: e.grant_project_id,
          dossierName: e.grant_project_id ? (projectById.get(e.grant_project_id)?.name ?? null) : null,
          handledAt: handled.get(`event:${e.id}`) ?? null,
        });
      }
      for (const n of notes) {
        const actor = actorFor(n.author_org_user_id, n.author_name);
        const relation = relationOf(actor, dossierClientFor(n.grant_project_id), supplierClientsByProject.get(n.grant_project_id) ?? []);
        items.push({
          key: `note:${n.id}`,
          refKind: "note",
          refId: n.id,
          occurredAt: n.created_at,
          sentence: activitySentence(actor, { kind: "note", excerpt: noteExcerpt(n.body) }, relation),
          grantProjectId: n.grant_project_id,
          dossierName: projectById.get(n.grant_project_id)?.name ?? null,
          handledAt: handled.get(`note:${n.id}`) ?? null,
        });
      }
      return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, MAX_ITEMS);
    },

    async setHandled(ctx: { organizationId: string; organizationUserId: string }, refKind: "event" | "note", refId: string, handledFlag: boolean) {
      if (handledFlag) {
        const { error } = await supabase
          .from("portal_activity_handled")
          .upsert({ organization_id: ctx.organizationId, ref_kind: refKind, ref_id: refId, handled_by: ctx.organizationUserId, handled_at: new Date().toISOString() });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("portal_activity_handled").delete().eq("ref_kind", refKind).eq("ref_id", refId);
        if (error) throw error;
      }
    },
  };
}
