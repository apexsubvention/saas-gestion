// Phrase en langage clair pour une activité faite dans le portail client (0076, Jade) :
// « Sitegrow (Alex) a déposé une facture (collect1.pdf) pour le versement 1 de son client
// enfant Caracol ». Fonction pure -- testable sans base.

export type ActivityActor = {
  clientId: string | null;
  clientName: string | null;
  personName: string | null;
};

export type ActivityDossierClient = {
  id: string;
  name: string;
  parentClientId: string | null;
};

export type ActivityFacts =
  | { kind: "installment_invoice"; installmentNumber: number | null; filename: string | null }
  | { kind: "document"; requestTitle: string | null; filename: string | null }
  | { kind: "task_done"; taskTitle: string | null }
  | { kind: "payment_status"; paid: boolean }
  | { kind: "payment_proof"; filename: string | null }
  | { kind: "opportunity_response"; interested: boolean }
  | { kind: "note"; excerpt: string }
  | { kind: "other"; title: string };

// Lien entre la personne qui agit et le client du dossier : son propre dossier, celui d'un
// client enfant (hiérarchie, 0028), ou celui d'un client dont elle est fournisseur (0047).
export type ActivityRelation =
  | { kind: "own" }
  | { kind: "child"; name: string }
  | { kind: "supplier"; name: string }
  | { kind: "other"; name: string };

export function relationOf(actor: ActivityActor, dossierClient: ActivityDossierClient | null, supplierClientIds: string[]): ActivityRelation {
  if (!dossierClient) return { kind: "own" };
  if (actor.clientId && actor.clientId === dossierClient.id) return { kind: "own" };
  if (actor.clientId && dossierClient.parentClientId === actor.clientId) return { kind: "child", name: dossierClient.name };
  if (actor.clientId && supplierClientIds.includes(actor.clientId)) return { kind: "supplier", name: dossierClient.name };
  return { kind: "other", name: dossierClient.name };
}

// Après l'objet de l'action : « … pour le versement 1 de son client enfant Caracol ».
function trailing(r: ActivityRelation): string {
  switch (r.kind) {
    case "own": return "";
    case "child": return ` de son client enfant ${r.name}`;
    case "supplier": return ` en tant que fournisseur de ${r.name}`;
    case "other": return ` pour ${r.name}`;
  }
}

// Avant une citation (note) : « a écrit une note dans le dossier de son client enfant Caracol : « … » ».
function inDossier(r: ActivityRelation): string {
  switch (r.kind) {
    case "own": return "";
    case "child": return ` dans le dossier de son client enfant ${r.name}`;
    case "supplier": return ` (en tant que fournisseur) dans le dossier de ${r.name}`;
    case "other": return ` dans le dossier de ${r.name}`;
  }
}

function quote(s: string) {
  return `« ${s} »`;
}

function phrase(f: ActivityFacts): string {
  switch (f.kind) {
    case "installment_invoice":
      return `déposé une facture${f.filename ? ` (${f.filename})` : ""}${f.installmentNumber != null ? ` pour le versement ${f.installmentNumber}` : ""}`;
    case "document":
      if (f.requestTitle) return `déposé le document demandé ${quote(f.requestTitle)}${f.filename ? ` (${f.filename})` : ""}`;
      return `déposé un document${f.filename ? ` (${f.filename})` : ""}`;
    case "task_done":
      return `marqué une tâche comme faite${f.taskTitle ? ` : ${quote(f.taskTitle)}` : ""}`;
    case "payment_status":
      return f.paid ? "marqué une facture comme payée" : "remis une facture à « envoyée, non payée »";
    case "payment_proof":
      return `déposé une preuve de paiement${f.filename ? ` (${f.filename})` : ""}`;
    case "opportunity_response":
      return f.interested ? "répondu que l'opportunité l'intéresse" : "répondu que l'opportunité ne convient pas";
    case "note":
      return `écrit une note : ${quote(f.excerpt)}`; // relation insérée avant la citation, voir activitySentence
    case "other":
      return `fait une action : ${f.title}`;
  }
}

export function activitySentence(actor: ActivityActor, facts: ActivityFacts, relation: ActivityRelation): string {
  const who = actor.clientName
    ? `${actor.clientName}${actor.personName && actor.personName !== actor.clientName ? ` (${actor.personName})` : ""}`
    : (actor.personName ?? "Le client");
  if (facts.kind === "note") return `${who} a écrit une note${inDossier(relation)} : ${quote(facts.excerpt)}`;
  return `${who} a ${phrase(facts)}${trailing(relation)}`;
}

// Lit les faits utiles dans une ligne du journal (kind + title déjà écrits par les actions portail).
export function factsFromEvent(e: { kind: string; title: string }, extra: { installmentNumber?: number | null; filename?: string | null }): ActivityFacts {
  const afterColon = e.title.includes(" : ") ? e.title.slice(e.title.indexOf(" : ") + 3).trim() : null;
  switch (e.kind) {
    case "installment_invoice_received_portal": {
      const m = e.title.match(/n°\s*(\d+)/);
      return { kind: "installment_invoice", installmentNumber: extra.installmentNumber ?? (m ? Number(m[1]) : null), filename: extra.filename ?? null };
    }
    case "document_received_portal":
      return /^Document reçu du client/.test(e.title)
        ? { kind: "document", requestTitle: afterColon, filename: extra.filename ?? null }
        : { kind: "document", requestTitle: null, filename: extra.filename ?? afterColon };
    case "task_done_portal":
      return { kind: "task_done", taskTitle: afterColon };
    case "invoice_payment_status_changed_portal":
      return { kind: "payment_status", paid: /payée par le client/.test(e.title) && !/non payée/.test(e.title) };
    case "invoice_payment_proof_uploaded_portal":
      return { kind: "payment_proof", filename: extra.filename ?? null };
    case "opportunity_response_submitted":
      return { kind: "opportunity_response", interested: /intéresse/.test(e.title) };
    default:
      return { kind: "other", title: e.title };
  }
}

export function noteExcerpt(body: string, max = 140) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
