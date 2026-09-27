import type { PortalDossier } from "@/server/services/portalDossiers.service";
import { computePriorityBucket } from "@/features/schedule/priority";

// Ordre de priorité demandé par Jade pour "Mes dossiers" : un dossier avec une
// réclamation encore en attente (pas payée, pas refusée -- même définition que
// ACTIVE_CLAIM_STATUSES_EXCLUDED sur la page d'accueil du portail) passe avant un
// dossier sans réclamation active ; parmi les dossiers en attente, le plus proche de son
// échéance de réclamation (due_date) passe en premier. Purement côté affichage -- aucune
// requête supplémentaire, les réclamations sont déjà chargées avec chaque dossier.
const PENDING_CLAIM_STATUSES_EXCLUDED = ["paid", "rejected"];

// Statuts d'une réclamation AVANT son dépôt -- une fois déposée (submitted et après), plus
// besoin d'attirer l'attention sur SA date limite de dépôt (0065, voir hasClaimDueSoon
// ci-dessous) : le reste de son cycle de vie (analyse, paiement) ne dépend plus d'une action
// urgente du client/personnel sur une échéance de dépôt.
const PRE_SUBMISSION_CLAIM_STATUSES = ["planned", "preparing", "missing_documents", "ready"];

// Jade (0065) : sur la vignette du portail, signaler clairement « tu as quelque chose à faire »
// quand une réclamation (déjà créée OU seulement suggérée par l'entente, pas encore déposée)
// arrive à échéance dans les 7 prochains jours ou est déjà en retard -- même seuil que
// l'échéancier interne (computePriorityBucket : "overdue"/"this_week"). Se referme tout seul dès
// que le personnel avance le statut de la réclamation (ClaimStatusSelect -> "Déposée — en
// attente" ou plus loin) ou marque l'échéance suggérée comme terminée/annulée
// (MilestoneStatusSelect) -- aucun nouveau mécanisme d'acquittement nécessaire, ces deux
// contrôles existent déjà côté admin.
// Jade (0068) : « RÉSUMÉ » du dossier -- besoin du DÉTAIL (titre + date), pas seulement du
// booléen, pour écrire une phrase utile ("Réclamation X à déposer avant le..."). Même seuil et
// mêmes candidats que hasClaimDueSoon ci-dessous (qui délègue ici) : la réclamation ou l'échéance
// suggérée la plus proche parmi celles encore en retard ou dues cette semaine.
export type DueSoonClaim = { title: string; dueDate: string };

export function nextClaimDueSoon(dossier: PortalDossier): DueSoonClaim | null {
  const candidates: DueSoonClaim[] = [];
  for (const c of dossier.claims) {
    if (!PRE_SUBMISSION_CLAIM_STATUSES.includes(c.status) || !c.due_date) continue;
    const bucket = computePriorityBucket(c.due_date, false);
    if (bucket === "overdue" || bucket === "this_week") candidates.push({ title: c.claim_number ?? "Réclamation", dueDate: c.due_date });
  }
  for (const m of dossier.upcomingClaims) {
    if (!m.dueDate) continue;
    const bucket = computePriorityBucket(m.dueDate, false);
    if (bucket === "overdue" || bucket === "this_week") candidates.push({ title: m.title, dueDate: m.dueDate });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return candidates[0]!;
}

export function hasClaimDueSoon(dossier: PortalDossier): boolean {
  return nextClaimDueSoon(dossier) != null;
}

// Un document demandé se réaffiche avec son formulaire tant qu'il n'est pas validé -- "issue"
// (problème signalé) permet de renvoyer un fichier corrigé, pas seulement "requested" (première
// fois). Même liste que DossierCard.tsx#UPLOADABLE_STATUSES -- dupliquée ici plutôt
// qu'importée : ce fichier ne dépend que du type PortalDossier, jamais d'un composant "use client".
const UPLOADABLE_STATUSES = ["requested", "issue"];

// Jade (0070) : « je veux un résumé de tout... concentré sur les trucs à fournir et les échéances
// à venir » -- déplacé de l'encadré Résumé PAR dossier (retiré, voir DossierCard.tsx) vers un seul
// encadré global en haut de la page d'accueil du portail (page.tsx). Mêmes filtres que la vignette
// (toProvideCount) et le badge "⚠️ X à fournir" -- projet ET réclamations confondus.
export function collectToProvideTitles(dossier: PortalDossier): string[] {
  const openRequirementLabels = dossier.claims.flatMap((c) => c.openRequirements.map((r) => r.label));
  const uploadableRequestTitles = [
    ...dossier.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).map((r) => r.title),
    ...dossier.claims.flatMap((c) => c.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).map((r) => r.title)),
  ];
  return [...openRequirementLabels, ...uploadableRequestTitles];
}

// Factures fournisseurs envoyées mais pas encore marquées payées -- isPariProgram exclu, comme
// DossierCard.tsx (0065) : la section "Factures fournisseurs" elle-même est masquée pour ces
// dossiers (coûts = salariés internes, pas des factures de fournisseurs externes).
export function collectUnpaidSupplierNames(dossier: PortalDossier): string[] {
  if (dossier.isPariProgram) return [];
  return Array.from(new Set(dossier.supplierInvoices.filter((inv) => inv.paymentStatus === "sent_unpaid").map((inv) => inv.supplierName)));
}

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
  // Un dossier complété passe toujours en dernier, peu importe les autres critères --
  // demandé par Jade : ce qui est terminé n'a plus besoin d'attirer l'attention du client.
  const aCompleted = a.status === "completed";
  const bCompleted = b.status === "completed";
  if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

  const pa = computeDossierPriority(a);
  const pb = computeDossierPriority(b);
  if (pa.hasPendingClaim !== pb.hasPendingClaim) return pa.hasPendingClaim ? -1 : 1;
  if (pa.nextClaimDueDate && pb.nextClaimDueDate) return pa.nextClaimDueDate.localeCompare(pb.nextClaimDueDate);
  if (pa.nextClaimDueDate) return -1;
  if (pb.nextClaimDueDate) return 1;
  return a.name.localeCompare(b.name);
}
