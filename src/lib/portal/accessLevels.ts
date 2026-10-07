// Niveaux d'accès d'un compte portail (0075, Jade) -- un par personne, choisi par le personnel
// sur la fiche client. Module sans dépendance serveur : utilisé aussi par les composants client.

export type PortalAccessLevel = "editor" | "commenter" | "viewer";

export const PORTAL_ACCESS_LEVELS: PortalAccessLevel[] = ["editor", "commenter", "viewer"];

export const PORTAL_ACCESS_LEVEL_LABELS: Record<PortalAccessLevel, string> = {
  editor: "Peut modifier",
  commenter: "Consultation + notes",
  viewer: "Consultation seulement",
};

export const PORTAL_ACCESS_LEVEL_HINTS: Record<PortalAccessLevel, string> = {
  editor: "Le client : téléverse factures et documents, répond aux demandes, change les statuts, écrit des notes.",
  commenter: "Voit tout et peut échanger dans les notes, sans rien modifier (ex. comptable).",
  viewer: "Voit tout, ne modifie rien (ex. partenaire externe).",
};

export function parsePortalAccessLevel(value: unknown): PortalAccessLevel {
  return PORTAL_ACCESS_LEVELS.includes(value as PortalAccessLevel) ? (value as PortalAccessLevel) : "editor";
}

export const canEditPortal = (level: PortalAccessLevel) => level === "editor";
export const canCommentPortal = (level: PortalAccessLevel) => level === "editor" || level === "commenter";

export const PORTAL_READ_ONLY_MESSAGE = "Ton accès au portail est en consultation seulement : demande à la personne responsable chez toi, ou à l'équipe Apex, de faire ce changement.";
