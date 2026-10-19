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

// Jade (0079) : le compte connecté a-t-il un modèle de facture (menu « Modèle de facture ») ? Si
// oui, chaque versement du plan de facturation offre « Préparer ma facture ».
const InvoiceTemplateContext = createContext(false);

export function InvoiceTemplateProvider({ hasTemplate, children }: { hasTemplate: boolean; children: React.ReactNode }) {
  return <InvoiceTemplateContext.Provider value={hasTemplate}>{children}</InvoiceTemplateContext.Provider>;
}

export function useHasInvoiceTemplate() {
  return useContext(InvoiceTemplateContext);
}
