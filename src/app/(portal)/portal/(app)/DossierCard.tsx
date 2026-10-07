"use client";

// Carte pour un dossier du portail client -- statut bien visible + indicateur d'urgence
// (documents à fournir, échéance de paiement/facturation, réclamation due bientôt -- 0065)
// directement sur la carte, sans avoir à l'ouvrir.
// Empilée dans une colonne de statut (DossiersList.tsx, tableau façon Trello, 0063) plutôt
// qu'en grille compacte (0062, dépassé). Un clic ouvre une fenêtre modale (0062, Jade :
// « comme en ce moment sur Détails, mais plus comme un pop-up ») avec le contenu détaillé --
// dates, réclamations (documents manquants ET déjà déposés, réclamations à venir), résumé de
// facturation, convention, texte rédigé du questionnaire, etc. -- au lieu de déplier la carte
// sur place.
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { PortalDossier, PortalDocumentRequestView } from "@/server/services/portalDossiers.service";
import { respondToOpportunityAction } from "./actions";
import {
  CLAIM_STATUS_LABELS,
  claimStatusBadgeClass,
  CLAIM_REQUIREMENT_STATUS_LABELS,
  claimRequirementStatusBadgeClass,
  documentRequestStatusBadgeClass,
  grantProjectStatusBadgeClass,
  DOCUMENT_CATEGORY_LABELS,
} from "@/features/grants/constants";
import { DocumentRequestUpload } from "./DocumentRequestUpload";
import { PortalTaskDoneButton } from "./PortalTaskDoneButton";
import { PortalTaskCard } from "./PortalTaskCard";
import { InstallmentInvoiceUpload } from "./InstallmentInvoiceUpload";
import { PortalNotes } from "./PortalNotes";
import { PortalSupplierInvoices } from "./PortalSupplierInvoices";
import { computeSubsidy } from "@/features/grants/subsidyMath";
import { buildBillingNarrative, buildBillerSentence } from "@/features/billing/billingSummary";
import { computePaymentDeadline, paymentDeadlineAlertText } from "@/features/billing/paymentDeadline";
import { PortalOpenDocumentButton } from "./PortalOpenDocumentButton";
import { nextClaimDueSoon, collectToProvideTitles, collectUnpaidSupplierNames, remainingBalanceFor } from "./dossierPriority";
import { usePortalAccess } from "./PortalAccessContext";

// Un document demandé se réaffiche avec son formulaire de téléversement tant qu'il
// n'est pas validé par le personnel -- "issue" (problème signalé) permet donc bien de
// renvoyer un fichier corrigé, pas seulement "requested" (première fois).
const UPLOADABLE_STATUSES = ["requested", "issue"];

// Fenêtre modale générique (0062) : superposée à la page plutôt que de pousser le contenu --
// ferme sur Échap, sur clic à l'extérieur, ou sur le bouton ×. Le défilement se fait dans le
// panneau (max-h-[85vh] overflow-y-auto), jamais sur la page en arrière-plan.
function Modal({ onClose, header, children }: { onClose: () => void; header: ReactNode; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          {header}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// 0070 -- exporté pour être réutilisé tel quel par SupplierDossierCard.tsx (demandes attribuées à
// un fournisseur inscrit, même rendu que côté client).
export function DocumentRequestItem({ request }: { request: PortalDocumentRequestView }) {
  return (
    <div className="rounded-md border border-neutral-100 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-neutral-900">{request.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${documentRequestStatusBadgeClass(request.status)}`}>
          {request.statusLabel}
        </span>
      </div>
      {request.instructions && <p className="mt-1 text-xs text-neutral-500">{request.instructions}</p>}
      {request.dueDate && <p className="mt-1 text-xs text-neutral-500">Échéance : {formatDate(request.dueDate)}</p>}
      {UPLOADABLE_STATUSES.includes(request.status) ? (
        request.requiresUpload ? (
          <DocumentRequestUpload requestId={request.id} filename={request.filename} />
        ) : (
          <PortalTaskDoneButton requestId={request.id} />
        )
      ) : request.filename ? (
        <p className="mt-2 text-xs text-emerald-700">Reçu : {request.filename}</p>
      ) : (
        !request.requiresUpload && <p className="mt-2 text-xs text-emerald-700">Fait — en attente de validation.</p>
      )}
    </div>
  );
}

const REDACTION_STAGE_LABELS: Record<PortalDossier["redaction"][number]["stage"], string> = {
  final: "Texte final",
  user_draft: "Brouillon (révisé)",
  ai_draft: "Brouillon (proposé par IA — à réviser)",
};

function redactionStageBadgeClass(stage: PortalDossier["redaction"][number]["stage"]): string {
  switch (stage) {
    case "final":
      return "bg-emerald-50 text-emerald-700";
    case "user_draft":
      return "bg-indigo-50 text-indigo-700";
    default:
      return "bg-amber-50 text-amber-800";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA");
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("fr-CA", { minimumFractionDigits: 2 })} $`;
}

// Résumé du programme (Jade) : contexte, dépenses admissibles/non admissibles, ce qu'il faut
// pour déposer et montants min/max -- un sous-ensemble volontairement restreint du dernier
// program_snapshots figé (voir PortalProgramSummary, portalDossiers.service.ts). Chaque champ
// ne s'affiche que s'il est renseigné -- jamais de "—" qui donnerait l'impression d'un vide
// confirmé alors qu'Apex n'a simplement pas cette information.
function formatPercent(rate: number): string {
  return `${Math.round(rate * 10000) / 100} %`;
}

function ProgramSummarySection({ summary }: { summary: NonNullable<PortalDossier["programSummary"]> }) {
  const hasAmounts = summary.minEligibleSpend != null || summary.maxAidAmount != null || summary.typicalAidRate != null;
  return (
    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Résumé du programme</h3>
        <span className="text-[11px] text-indigo-400">Figé le {formatDate(summary.takenAt)}</span>
      </div>

      {summary.description && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Contexte</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{summary.description}</p>
        </div>
      )}

      {hasAmounts && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {summary.minEligibleSpend != null && (
            <div>
              <p className="text-xs text-neutral-500">Dépenses minimales</p>
              <p className="text-neutral-800">{formatAmount(summary.minEligibleSpend)}</p>
            </div>
          )}
          {summary.maxAidAmount != null && (
            <div>
              <p className="text-xs text-neutral-500">Montant maximal</p>
              <p className="text-neutral-800">{formatAmount(summary.maxAidAmount)}</p>
            </div>
          )}
          {summary.typicalAidRate != null && (
            <div>
              <p className="text-xs text-neutral-500">% de subvention</p>
              <p className="text-neutral-800">{formatPercent(summary.typicalAidRate)}</p>
            </div>
          )}
        </div>
      )}

      {summary.aidNotes && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Formule d&apos;aide</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{summary.aidNotes}</p>
        </div>
      )}

      {summary.eligibleExpenses && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Dépenses admissibles</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{summary.eligibleExpenses}</p>
        </div>
      )}

      {summary.ineligibleExpenses && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Dépenses non admissibles</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{summary.ineligibleExpenses}</p>
        </div>
      )}

      {summary.applicationProcess && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Ce qu&apos;il faut pour déposer</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{summary.applicationProcess}</p>
        </div>
      )}

      {summary.requiredDocuments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Documents à préparer</p>
          <ul className="mt-0.5 list-inside list-disc text-sm text-neutral-800">
            {summary.requiredDocuments.map((doc, i) => (
              <li key={i}>{doc}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 0071 (Jade, chantier 2) : montré uniquement pendant que le dossier est « Opportunité à
// confirmer » -- texte libre du personnel (angles possibles) + réponse du client (intéressé /
// ne convient pas), qui notifie le personnel (respondToOpportunityAction).
function OpportunitySection({ dossier }: { dossier: PortalDossier }) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState(dossier.clientOpportunityResponse);
  const [error, setError] = useState<string | null>(null);
  const { canEdit } = usePortalAccess();

  function submit(value: "interested" | "not_interested") {
    setError(null);
    startTransition(async () => {
      const result = await respondToOpportunityAction(dossier.id, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setResponse(value);
    });
  }

  const hasPotential = dossier.opportunityPotentialAmount != null || dossier.opportunityReimbursementRate != null;

  return (
    <div className="space-y-3 rounded-lg border border-purple-100 bg-purple-50/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-700">Opportunité à confirmer</h3>

      {hasPotential && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {dossier.opportunityPotentialAmount != null && (
            <div>
              <p className="text-xs text-neutral-500">Potentiel $ à aller chercher</p>
              <p className="font-medium text-neutral-800">{formatAmount(dossier.opportunityPotentialAmount)}</p>
            </div>
          )}
          {dossier.opportunityReimbursementRate != null && (
            <div>
              <p className="text-xs text-neutral-500">% de remboursement</p>
              <p className="font-medium text-neutral-800">{formatPercent(dossier.opportunityReimbursementRate)}</p>
            </div>
          )}
        </div>
      )}

      {dossier.opportunityAngleNotes && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Angles possibles pour vous</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{dossier.opportunityAngleNotes}</p>
        </div>
      )}

      {dossier.opportunityDocuments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-500">Documents</p>
          <ul className="mt-1 space-y-1">
            {dossier.opportunityDocuments.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-100 bg-white px-2.5 py-1.5 text-sm">
                <span className="min-w-0 truncate text-neutral-700" title={d.filename}>
                  {d.filename}
                  <span className="ml-1.5 text-xs text-neutral-400">({DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category})</span>
                </span>
                <PortalOpenDocumentButton documentId={d.id} filename={d.filename} className="shrink-0 text-xs text-blue-600 hover:underline" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-neutral-500">Ce programme t&apos;intéresse-t-il ?</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending || !canEdit}
            onClick={() => submit("interested")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${response === "interested" ? "bg-emerald-600 text-white" : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
          >
            Ce programme m&apos;intéresse
          </button>
          <button
            type="button"
            disabled={isPending || !canEdit}
            onClick={() => submit("not_interested")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${response === "not_interested" ? "bg-red-600 text-white" : "border border-red-300 text-red-700 hover:bg-red-50"}`}
          >
            Ne convient pas pour mes projets
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export function DossierCard({ dossier, currentOrgUserId }: { dossier: PortalDossier; currentOrgUserId: string | null }) {
  const [modalOpen, setModalOpen] = useState(false);
  // Résumé en langage clair (Jade) : mêmes chiffres que le tableau interne (SubsidyPanel), en
  // phrase -- voir src/features/billing/billingSummary.ts. spent=0 : on ne connaît pas les
  // dépenses déjà facturées ici (pas nécessaire, seule la cible totale compte pour ce résumé).
  const subsidy = computeSubsidy({ rate: dossier.grantRate, maxSubsidy: dossier.approvedGrantAmount, totalProjectCost: dossier.totalProjectCost, spent: 0 });
  // (0059, Jade) : ce qui sera VRAIMENT facturé, ce sont les postes cochés "À facturer" dans Aide à
  // la facturation -- jamais le coût total du projet (qui inclut les coûts internes, ex. salaire,
  // jamais facturés par personne). Dès que des postes existent pour ce dossier, on utilise leur
  // somme plutôt que le coût total ; sinon (aucun poste encore extrait/saisi) on retombe sur
  // l'ancien calcul (coût total requis pour atteindre la subvention) -- jamais de valeur inventée.
  const lineItemsTotal = dossier.billingLineItems.filter((it) => it.includedInBilling).reduce((sum, it) => sum + it.amount, 0);
  const billerAmount = dossier.billingLineItems.length > 0 ? lineItemsTotal : subsidy.ready ? subsidy.requiredSpend : null;
  // (0063, Jade) : une phrase PAR FOURNISSEUR (« Sitegrow devra avoir facturé... ») plutôt qu'une
  // seule phrase combinée, dès qu'au moins un fournisseur a un Budget prévu calculé -- voir
  // portalDossiers.service.ts#billingBySupplier. billerAmount ci-dessus (combiné) sert alors
  // seulement de repli quand aucun fournisseur n'est encore associé à un poste facturable.
  const hasSupplierBilling = dossier.billingBySupplier.length > 0;
  // Jade : dans le portail client, on ne mentionne PAS les coûts internes exclus -- seul ce qui est
  // vraiment coché "À facturer" compte pour le client parent, une précision sur les coûts internes
  // pourrait mélanger. Cette nuance reste réservée à l'interne (grants/[id]/page.tsx).
  const billingNarrative = buildBillingNarrative({
    clientName: dossier.clientName ?? "Le client",
    subsidy,
    billerLabel: null,
    billerAmount: hasSupplierBilling ? null : billerAmount,
    deadline: dossier.billingDeadline,
  });
  // Montant récurrent (le fournisseur facture à chaque cycle de réclamation, pas un total unique
  // dû d'un coup) -- voir buildBillerSentence#perCycle.
  const supplierBillingSentences = dossier.billingBySupplier
    .map((s) =>
      buildBillerSentence({
        clientName: dossier.clientName ?? "Le client",
        billerLabel: s.supplierName,
        billerAmount: s.amount,
        deadline: dossier.billingDeadline,
        perCycle: true,
      })
    )
    .filter((s): s is string => !!s);
  // Alerte SÉPARÉE (jamais fondue dans billingNarrative ci-dessus) sur le délai de paiement et
  // de facturation lu dans la convention -- même calcul et même texte que côté admin/fournisseur.
  const paymentDeadline = computePaymentDeadline({
    projectEnd: dossier.billingDeadline,
    paymentDeadlineDate: dossier.paymentDeadlineDate,
    paymentDeadlineDaysAfterEnd: dossier.paymentDeadlineDaysAfterEnd,
  });
  const paymentDeadlineText = paymentDeadlineAlertText(paymentDeadline, dossier.paymentDeadlineDaysAfterEnd);
  // Solde restant (0063) -- voir dossierPriority.ts#remainingBalanceFor, partagé avec le cumul
  // global de la page d'accueil du portail (0071).
  const remainingBalance = remainingBalanceFor(dossier);
  // Titres des documents/pièces encore à fournir -- mêmes filtres que toProvideCount ci-dessous,
  // partagés avec le résumé global (0070) affiché maintenant en haut de la page d'accueil du
  // portail plutôt qu'ici, voir page.tsx et dossierPriority.ts#collectToProvideTitles.
  const toProvideTitles = collectToProvideTitles(dossier);
  const toProvideCount = toProvideTitles.length;
  // Réclamation (créée ou seulement suggérée par l'entente) due dans 7 jours ou moins, ou déjà
  // en retard, et pas encore déposée (0065, Jade : « tu as quelque chose à faire ») -- voir
  // dossierPriority.ts#nextClaimDueSoon pour le détail et la condition d'auto-fermeture.
  const dueSoonClaim = nextClaimDueSoon(dossier);
  const claimDueSoon = dueSoonClaim != null;
  // Factures fournisseurs envoyées mais pas encore marquées payées -- gardé seulement comme
  // signal d'urgence (bordure ambrée) ; le détail (noms) vit dans le résumé global, page.tsx.
  const hasUnpaidSupplierInvoice = collectUnpaidSupplierNames(dossier).length > 0;
  // Indicateur d'urgence visible directement sur la vignette (0062, Jade), sans avoir à
  // l'ouvrir : quelque chose à fournir, une échéance de paiement/facturation déjà connue, une
  // réclamation due bientôt, ou une facture envoyée pas encore marquée payée.
  const isUrgent = toProvideCount > 0 || !!paymentDeadlineText || claimDueSoon || hasUnpaidSupplierInvoice;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
          isUrgent ? "border-amber-200" : "border-neutral-200 hover:border-neutral-300"
        }`}
      >
        {isUrgent && <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden="true" />}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-neutral-900">{dossier.name}</p>
            {/* Programme sur sa propre ligne (0063, Jade : « on voit seulement le titre du projet,
                j'aimerais qu'on voit le programme ») -- jamais tronqué en même temps que le nom du
                client, qui pouvait le faire disparaître complètement. */}
            {dossier.programName && <p className="mt-0.5 truncate text-sm text-neutral-600">{dossier.programName}</p>}
            {dossier.clientName && <p className="mt-0.5 truncate text-xs text-neutral-400">{dossier.clientName}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${grantProjectStatusBadgeClass(dossier.status)}`}>
              {dossier.statusLabel}
            </span>
            {/* Convention en évidence, en vert, sous le statut (0063, Jade) -- indicateur seulement
                ici (pas de bouton imbriqué dans la vignette, qui est elle-même un bouton) ; le vrai
                lien pour l'ouvrir est dans la fenêtre de détails ci-dessous. */}
            {dossier.agreementDocument && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Convention ✓</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <span>{dossier.claims.length} réclamation{dossier.claims.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            {toProvideCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                ⚠️ {toProvideCount} à fournir
              </span>
            )}
            {claimDueSoon && (
              <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-800">
                📅 Réclamation à faire
              </span>
            )}
            {paymentDeadlineText && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">⏰ Échéance</span>
            )}
            <span className="text-neutral-400">Détails →</span>
          </div>
        </div>
      </button>

      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          header={
            <div className="min-w-0">
              <p className="truncate font-semibold text-neutral-900">{dossier.name}</p>
              {dossier.programName && <p className="mt-0.5 text-sm text-neutral-600">{dossier.programName}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${grantProjectStatusBadgeClass(dossier.status)}`}>
                  {dossier.statusLabel}
                </span>
                {dossier.clientName && <span className="text-xs text-neutral-500">{dossier.clientName}</span>}
                {dossier.agreementDocument && (
                  <PortalOpenDocumentButton
                    documentId={dossier.agreementDocument.id}
                    filename={dossier.agreementDocument.filename}
                    label="Voir la convention"
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  />
                )}
              </div>
            </div>
          }
        >
          {/* Résumé (0068) retiré d'ici (0070, Jade : « je veux un résumé de tout » plutôt qu'un
              par dossier caché dans chaque fiche) -- déplacé en un seul encadré global tout en
              haut de la page d'accueil du portail, voir page.tsx. */}
          {paymentDeadlineText && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-semibold">⏰ Délai de paiement et de facturation</p>
              <p className="mt-1">{paymentDeadlineText}</p>
            </div>
          )}

          {/* Tâches à faire pour le client (0067, Jade) -- juste sous le délai de paiement, avant
              le reste des détails du dossier : c'est la première chose actionnable qu'il doit voir
              en ouvrant un dossier. Anciennement « Documents demandés » -- pas chaque tâche
              n'a besoin d'un fichier, voir requiresUpload sur DocumentRequestItem plus haut.
              0069 -- les vraies tâches (table tasks) explicitement attribuées à ce client et
              rendues visibles dans son portail rejoignent la même liste, triée par échéance
              (sans échéance en dernier) plutôt que deux sections « Tâches » qui se ressembleraient. */}
          {(dossier.documentRequests.length > 0 || dossier.tasks.length > 0) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tâches à faire</h3>
              <div className="space-y-2">
                {[
                  ...dossier.documentRequests.map((r) => ({ kind: "request" as const, dueDate: r.dueDate, r })),
                  ...dossier.tasks.map((t) => ({ kind: "task" as const, dueDate: t.dueDate, t })),
                ]
                  .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
                  .map((item) =>
                    item.kind === "request" ? <DocumentRequestItem key={`r-${item.r.id}`} request={item.r} /> : <PortalTaskCard key={`t-${item.t.id}`} task={item.t} />
                  )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-neutral-400">Début</p>
              <p className="text-neutral-800">{formatDate(dossier.officialStartDate)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Fin</p>
              <p className="text-neutral-800">{formatDate(dossier.officialEndDate)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Montant approuvé</p>
              <p className="text-neutral-800">{formatAmount(dossier.approvedGrantAmount)}</p>
            </div>
            {/* Solde restant (0063, Jade) : montant approuvé moins les réclamations déjà faites --
                voir remainingBalance ci-dessus. Absent (pas seulement "—") quand le montant
                approuvé lui-même est inconnu, pour ne jamais laisser croire à un solde à 0. */}
            {remainingBalance != null && (
              <div>
                <p className="text-xs text-neutral-400">Solde restant</p>
                <p className="text-neutral-800">{formatAmount(remainingBalance)}</p>
              </div>
            )}
          </div>

          {dossier.programSummary && <ProgramSummarySection summary={dossier.programSummary} />}

          {dossier.status === "opportunity_to_confirm" && <OpportunitySection dossier={dossier} />}

          {(billingNarrative || supplierBillingSentences.length > 0) && (
            <div className="space-y-1.5 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
              {billingNarrative && <p>{billingNarrative}</p>}
              {supplierBillingSentences.map((sentence, i) => (
                <p key={i}>{sentence}</p>
              ))}
            </div>
          )}

          {dossier.billingInstallments.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Calendrier de facturation</h3>
              <p className="text-xs text-neutral-400">
                Montant et texte suggéré pour chaque facture à venir, déjà répartis sur les versements prévus.
              </p>
              <div className="space-y-2">
                {dossier.billingInstallments.map((inst) => (
                  <div key={inst.id} className="rounded-md border border-neutral-100 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">
                        Versement n°{inst.installmentNumber} — {formatDate(inst.periodStart)} au {formatDate(inst.periodEnd)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-neutral-800">{formatAmount(inst.amount)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inst.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                          {inst.status === "submitted" ? "Facturé" : "À venir"}
                        </span>
                      </span>
                    </div>
                    {inst.invoiceDescription && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{inst.invoiceDescription}</p>}
                    <InstallmentInvoiceUpload installmentId={inst.id} uploadedFilename={inst.clientInvoiceFilename} uploadedAt={inst.clientInvoiceUploadedAt} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            dossier.billingLineItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">À inscrire sur les factures</h3>
                {/* Jade : les postes non facturés (ex. salaire interne) comptent quand même dans le
                    coût total du projet -- un client se dit souvent "j'aurais payé mon employé de
                    toute façon", donc voir ce montant aide à comprendre le budget global du projet.
                    Affiché SEULEMENT pour ces postes (jamais pour ceux à facturer -- ni leur
                    affichage ni Montant approuvé/Solde restant plus haut ne changent), avec une
                    étiquette qui le distingue clairement du budget sous-traitant facturable. */}
                {dossier.billingLineItems.some((it) => !it.includedInBilling) && (
                  <p className="text-xs text-neutral-400">
                    Les postes « Non facturé » (ex. salaire interne) comptent dans le coût total du projet mais ne s&apos;ajoutent pas au budget facturable ci-dessus -- montant affiché à titre indicatif seulement.
                  </p>
                )}
                <div className="space-y-2">
                  {dossier.billingLineItems.map((it) => (
                    <div key={it.id} className={`rounded-md border border-neutral-100 p-3 text-sm ${it.includedInBilling ? "" : "opacity-70"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-neutral-900">{it.label}</span>
                        <span className="flex items-center gap-2 text-xs text-neutral-500">
                          {it.hours != null && <span>{it.hours} h</span>}
                          {!it.includedInBilling && (
                            <>
                              <span className="text-neutral-600">{formatAmount(it.amount)}</span>
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">Non facturé</span>
                            </>
                          )}
                        </span>
                      </div>
                      {it.description && <p className="mt-1 text-xs text-neutral-500">{it.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* PARI CNRC (Jade) : pas de factures fournisseurs pour ce type de dossier -- les coûts
              sont des salariés internes (DDR), pas des factures de fournisseurs externes. Seules
              les Réclamations restent pertinentes, juste en dessous. */}
          {!dossier.isPariProgram && (
            <PortalSupplierInvoices invoices={dossier.supplierInvoices} requiresPaymentProof={dossier.requiresPaymentProof} />
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Réclamations</h3>
            {dossier.claims.length > 0 ? (
              <div className="space-y-2">
                {dossier.claims.map((c) => (
                  <div key={c.id} className="rounded-md border border-neutral-100 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">
                        {c.claim_number ?? "Réclamation"}
                        {c.period_start || c.period_end ? (
                          <span className="ml-2 font-normal text-neutral-500">
                            {formatDate(c.period_start)} – {formatDate(c.period_end)}
                          </span>
                        ) : null}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${claimStatusBadgeClass(c.status)}`}>
                        {CLAIM_STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-neutral-500">
                      {c.due_date && <span>Échéance : {formatDate(c.due_date)}</span>}
                      {c.claimed_amount != null && <span>Réclamé : {formatAmount(c.claimed_amount)}</span>}
                      {c.approved_amount != null && <span>Approuvé : {formatAmount(c.approved_amount)}</span>}
                    </div>
                    {c.openRequirements.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                        <p className="text-xs font-medium text-neutral-500">Documents à fournir</p>
                        {c.openRequirements.map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs">
                            <span className="text-neutral-700">{r.label}</span>
                            <span className={`rounded-full px-2 py-0.5 font-medium ${claimRequirementStatusBadgeClass(r.status)}`}>
                              {CLAIM_REQUIREMENT_STATUS_LABELS[r.status] ?? r.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {c.documentRequests.length > 0 && (
                      <div className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
                        <p className="text-xs font-medium text-neutral-500">Fichiers demandés</p>
                        {c.documentRequests.map((r) => (
                          <DocumentRequestItem key={r.id} request={r} />
                        ))}
                      </div>
                    )}
                    {/* Documents que le personnel a déposés pour CETTE réclamation (0063, Jade) --
                        montrés même une fois la réclamation payée, contrairement aux deux sections
                        ci-dessus qui ne couvrent que ce qu'il manque encore. */}
                    {c.documents.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                        <p className="text-xs font-medium text-neutral-500">Voir le dossier</p>
                        {c.documents.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-neutral-700">{d.filename}</span>
                            <PortalOpenDocumentButton documentId={d.id} filename={d.filename} className="shrink-0 text-xs text-blue-600 hover:underline" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Aucune réclamation pour l&apos;instant.</p>
            )}
          </div>

          {/* Réclamations à venir (0063, Jade : « on voit payé, mais pas celles à venir avec les
              dates ») -- des échéances (milestones.type='claim'), pas encore de vraie réclamation
              créée. "estimée" = suggérée depuis la convention, pas confirmée. Section à part
              entière, même poids visuel que "Réclamations" ci-dessus (0064, Jade : « c'est pas
              évident de voir la portion réclamation à venir ») -- plus une note discrète greffée
              dessous. */}
          {dossier.upcomingClaims.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Réclamations à venir</h3>
              <div className="space-y-2">
                {dossier.upcomingClaims.map((m) => (
                  <div key={m.id} className="rounded-md border border-indigo-100 bg-indigo-50/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">
                        {m.title}
                        {m.estimated && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                            estimée
                          </span>
                        )}
                      </span>
                      <span className="text-neutral-700">{m.dueDate ? formatDate(m.dueDate) : "Date à confirmer"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Texte rédigé — pour révision</h3>
            {dossier.redaction.length > 0 ? (
              <div className="space-y-3">
                {dossier.redaction.map((item) => (
                  <div key={item.id} className="rounded-md border border-neutral-100 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{item.prompt}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${redactionStageBadgeClass(item.stage)}`}>
                        {REDACTION_STAGE_LABELS[item.stage]}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-neutral-700">{item.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Rien de rédigé pour l&apos;instant.</p>
            )}
          </div>

          <PortalNotes
            grantProjectId={dossier.id}
            clientId={dossier.clientId}
            notes={dossier.notes}
            currentOrgUserId={currentOrgUserId}
            hint={
              dossier.status === "draft"
                ? "Décris les grandes lignes de ton projet, ou commente les dépenses prévues -- ton équipe chez Apex le lira ici."
                : dossier.status === "opportunity_to_confirm"
                  ? "Des questions sur cette opportunité ? Écris-les ici -- ton équipe chez Apex le lira."
                  : undefined
            }
          />
        </Modal>
      )}
    </>
  );
}
