"use client";

// Niveau d'accès du compte connecté (0075), fourni une seule fois par le layout du portail et lu
// par les composants qui affichent un formulaire ou un bouton d'action : en consultation, ils ne
// s'affichent pas (l'action serveur et la RLS refusent de toute façon -- ceci évite seulement
// d'offrir un bouton qui échouerait).
import { createContext, useContext } from "react";
import { canCommentPortal, canEditPortal, type PortalAccessLevel } from "@/lib/portal/accessLevels";

const PortalAccessContext = createContext<PortalAccessLevel>("editor");

export function PortalAccessProvider({ level, children }: { level: PortalAccessLevel; children: React.ReactNode }) {
  return <PortalAccessContext.Provider value={level}>{children}</PortalAccessContext.Provider>;
}

export function usePortalAccess() {
  const level = useContext(PortalAccessContext);
  return { level, canEdit: canEditPortal(level), canComment: canCommentPortal(level) };
}

export function ReadOnlyHint({ children }: { children?: React.ReactNode }) {
  return <p className="text-xs italic text-neutral-400">{children ?? "Consultation seulement"}</p>;
}
