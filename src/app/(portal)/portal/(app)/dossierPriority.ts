import type { PortalDossier } from "@/server/services/portalDossiers.service";

// Ordre de priorité demandé par Jade pour "Mes dossiers" : un dossier avec une
// réclamation encore en attente (pas payée, pas refusée -- même définition que
// ACTIVE_CLAIM_STATUSES_EXCLUDED sur la page d'accueil du portail) passe avant un
// dossier sans réclamation active ; parmi les dossiers en attente, le plus proche de son
// échéance de réclamation (due_date) passe en premier. Purement côté affichage -- aucune
// requête supplémentaire, les réclamations sont déjà chargées avec chaque dossier.
const PENDING_CLAIM_STATUSES_EXCLUDED = ["paid", "rejected"];

export type DossierPriority = { hasPendingClaim: boolean; nextClaimDueDate: string | null };

export function computeDossierPriority(dossier: PortalDossier): DossierPriority {
  const pendingClaims = dossier.claims.filter((c) => !PENDING_CLAIM_STATUSES_EXCLUDED.includes(c.status));
  const dueDates = pendingClaims.map((c) => c.due_date).filter((d): d is string => Boolean(d)).sort();
  return {
    hasPendingClaim: pendingClaims.length > 0,
    nextClaimDueDate: dueDates[0] ?? null,
  };
}

export function compareDossiersByPriority(a: PortalDossier, b: PortalDossier): number {
  const pa = computeDossierPriority(a);
  const pb = computeDossierPriority(b);
  if (pa.hasPendingClaim !== pb.hasPendingClaim) return pa.hasPendingClaim ? -1 : 1;
  if (pa.nextClaimDueDate && pb.nextClaimDueDate) return pa.nextClaimDueDate.localeCompare(pb.nextClaimDueDate);
  if (pa.nextClaimDueDate) return -1;
  if (pb.nextClaimDueDate) return 1;
  return a.name.localeCompare(b.name);
}
