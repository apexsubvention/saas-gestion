// 0070 -- Jade : attribuer une demande (« Tâches à faire pour le client ») au client du dossier
// (comportement historique, seul cas avant 0070), à son client parent, à un de ses clients
// enfants, ou à un fournisseur inscrit sur ce dossier. Ce fichier construit la liste d'options
// partagée par NewDocumentRequestForm (création) ; la validation réelle (le client/fournisseur
// choisi appartient bien à ce dossier) se fait côté serveur dans documentRequestTargetResolve.ts,
// jamais seulement ici.
//
// Contrairement aux tâches internes (taskTargetOptions.ts, retiré en 0070), une demande de
// document est TOUJOURS visible dans le portail (pas de case "Visible dans son portail" -- voir
// visible_in_client_portal, toujours true) : un fournisseur SANS compte portail n'est donc même
// pas proposé ici (l'attribuer rendrait la demande invisible pour tout le monde côté externe).

export type DocumentRequestTargetKind = "client" | "parent_client" | "child_client" | "supplier";

export type DocumentRequestTargetOption = {
  targetKind: DocumentRequestTargetKind;
  // client_id pour client/parent_client/child_client, supplier_id pour supplier.
  value: string;
  label: string;
};

// Clé unique pour un <select> HTML (targetKind seul ne suffit pas : plusieurs enfants/fournisseurs
// possibles). Même format utilisé pour parser la valeur soumise côté client ET serveur.
export function documentRequestTargetOptionKey(targetKind: DocumentRequestTargetKind, value: string): string {
  return `${targetKind}:${value}`;
}

export function parseDocumentRequestTargetOptionKey(key: string): { targetKind: DocumentRequestTargetKind; value: string } | null {
  const sep = key.indexOf(":");
  if (sep < 0) return null;
  const targetKind = key.slice(0, sep);
  const value = key.slice(sep + 1);
  if (!value || !["client", "parent_client", "child_client", "supplier"].includes(targetKind)) return null;
  return { targetKind: targetKind as DocumentRequestTargetKind, value };
}

export function buildDocumentRequestTargetOptions(args: {
  clientId: string;
  clientName: string;
  parentClient: { id: string; name: string } | null;
  childClients: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string; hasPortalAccess: boolean }>;
}): DocumentRequestTargetOption[] {
  const options: DocumentRequestTargetOption[] = [
    { targetKind: "client", value: args.clientId, label: `Client du dossier — ${args.clientName}` },
  ];
  if (args.parentClient) {
    options.push({ targetKind: "parent_client", value: args.parentClient.id, label: `Client parent — ${args.parentClient.name}` });
  }
  for (const child of args.childClients) {
    options.push({ targetKind: "child_client", value: child.id, label: `Client enfant — ${child.name}` });
  }
  // Seulement les fournisseurs AVEC compte portail (voir le commentaire d'en-tête) : les autres
  // ne peuvent pas recevoir une demande, toujours visible dans son portail.
  for (const supplier of args.suppliers.filter((s) => s.hasPortalAccess)) {
    options.push({ targetKind: "supplier", value: supplier.id, label: `Fournisseur — ${supplier.name}` });
  }
  return options;
}

export const DOCUMENT_REQUEST_TARGET_KIND_LABELS: Record<DocumentRequestTargetKind, string> = {
  client: "Client du dossier",
  parent_client: "Client parent",
  child_client: "Client enfant",
  supplier: "Fournisseur",
};
