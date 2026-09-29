// 0069 -- Jade : attribuer une tâche au client du dossier (comportement historique, seul cas
// avant 0069), à son client parent, à un de ses clients enfants, ou à un fournisseur inscrit sur
// ce dossier -- avec la possibilité de la rendre visible dans LEUR portail respectif. Ce fichier
// construit la liste d'options partagée entre NewTaskForm (création) et TasksManager (édition) ;
// la validation réelle (le client/fournisseur choisi appartient bien à ce dossier) se fait
// côté serveur dans actions.ts/taskActions.ts, jamais seulement ici.

export type TaskTargetKind = "client" | "parent_client" | "child_client" | "supplier";

export type TaskTargetOption = {
  targetKind: TaskTargetKind;
  // client_id pour client/parent_client/child_client, supplier_id pour supplier.
  value: string;
  label: string;
  // false = pas de compte portail possible pour cette cible (fournisseur non "inscrit", sans
  // project_suppliers.supplier_client_id) -- "Visible dans son portail" reste désactivé.
  hasPortalAccess: boolean;
};

// Clé unique pour un <select> HTML (targetKind seul ne suffit pas : plusieurs enfants/fournisseurs
// possibles). Même format utilisé pour parser la valeur soumise côté client ET serveur.
export function taskTargetOptionKey(targetKind: TaskTargetKind, value: string): string {
  return `${targetKind}:${value}`;
}

export function parseTaskTargetOptionKey(key: string): { targetKind: TaskTargetKind; value: string } | null {
  const sep = key.indexOf(":");
  if (sep < 0) return null;
  const targetKind = key.slice(0, sep);
  const value = key.slice(sep + 1);
  if (!value || !["client", "parent_client", "child_client", "supplier"].includes(targetKind)) return null;
  return { targetKind: targetKind as TaskTargetKind, value };
}

export function buildTaskTargetOptions(args: {
  clientId: string;
  clientName: string;
  parentClient: { id: string; name: string } | null;
  childClients: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string; hasPortalAccess: boolean }>;
}): TaskTargetOption[] {
  const options: TaskTargetOption[] = [
    { targetKind: "client", value: args.clientId, label: `Client du dossier — ${args.clientName}`, hasPortalAccess: true },
  ];
  if (args.parentClient) {
    options.push({ targetKind: "parent_client", value: args.parentClient.id, label: `Client parent — ${args.parentClient.name}`, hasPortalAccess: true });
  }
  for (const child of args.childClients) {
    options.push({ targetKind: "child_client", value: child.id, label: `Client enfant — ${child.name}`, hasPortalAccess: true });
  }
  for (const supplier of args.suppliers) {
    options.push({
      targetKind: "supplier",
      value: supplier.id,
      label: `Fournisseur — ${supplier.name}${supplier.hasPortalAccess ? "" : " (pas de portail)"}`,
      hasPortalAccess: supplier.hasPortalAccess,
    });
  }
  return options;
}

export const TASK_TARGET_KIND_LABELS: Record<TaskTargetKind, string> = {
  client: "Client du dossier",
  parent_client: "Client parent",
  child_client: "Client enfant",
  supplier: "Fournisseur",
};
