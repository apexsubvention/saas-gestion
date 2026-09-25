"use client";

// Carte dépliable pour un dossier du portail client -- statut/dates, réclamations (avec
// documents manquants), et texte rédigé du questionnaire (pour révision par le client).
// Repliée par défaut : le client ouvre celle qui l'intéresse plutôt que de tout voir
// d'un coup, surtout utile pour un compte parent qui voit aussi les dossiers de ses
// clients enfants (hiérarchie, cf. 0028).
import { useState } from "react";
import type { PortalDossier, PortalDocumentRequestView } from "@/server/services/portalDossiers.service";
import {
  CLAIM_STATUS_LABELS,
  claimStatusBadgeClass,
  CLAIM_REQUIREMENT_STATUS_LABELS,
  claimRequirementStatusBadgeClass,
  documentRequestStatusBadgeClass,
  grantProjectStatusBadgeClass,
} from "@/features/grants/constants";
import { DocumentRequestUpload } from "./DocumentRequestUpload";
import { InstallmentInvoiceUpload } from "./InstallmentInvoiceUpload";
import { PortalNotes } from "./PortalNotes";
import { computeSubsidy } from "@/features/grants/subsidyMath";
import { buildBillingNarrative } from "@/features/billing/billingSummary";

// Un document demandé se réaffiche avec son formulaire de téléversement tant qu'il
// n'est pas validé par le personnel -- "issue" (problème signalé) permet donc bien de
// renvoyer un fichier corrigé, pas seulement "requested" (première fois).
const UPLOADABLE_STATUSES = ["requested", "issue"];

function DocumentRequestItem({ request }: { request: PortalDocumentRequestView }) {
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
        <DocumentRequestUpload requestId={request.id} filename={request.filename} />
      ) : (
        request.filename && <p className="mt-2 text-xs text-emerald-700">Reçu : {request.filename}</p>
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

export function DossierCard({ dossier, currentOrgUserId }: { dossier: PortalDossier; currentOrgUserId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  // Résumé en langage clair (Jade) : mêmes chiffres que le tableau interne (SubsidyPanel), en
  // phrase -- voir src/features/billing/billingSummary.ts. spent=0 : on ne connaît pas les
  // dépenses déjà facturées ici (pas nécessaire, seule la cible totale compte pour ce résumé).
  const subsidy = computeSubsidy({ rate: dossier.grantRate, maxSubsidy: dossier.approvedGrantAmount, totalProjectCost: dossier.totalProjectCost, spent: 0 });
  // Si le taux/coût total du projet n'est pas renseigné sur la fiche (ou l'entente), on retombe sur
  // le total déjà validé des activités/postes acceptés (aide à la facturation) -- sinon la phrase ne
  // s'affiche jamais sur un dossier où seule la convention a été lue, sans que le taux ait été
  // reporté sur la fiche. Jamais de valeur inventée : simplement une autre source déjà existante.
  const lineItemsTotal = dossier.billingLineItems.filter((it) => it.includedInBilling).reduce((sum, it) => sum + it.amount, 0);
  const billerAmount = subsidy.ready && subsidy.requiredSpend != null ? subsidy.requiredSpend : lineItemsTotal > 0 ? lineItemsTotal : null;
  const billingNarrative = buildBillingNarrative({
    clientName: dossier.clientName ?? "Le client",
    subsidy,
    billerLabel: null,
    billerAmount,
    deadline: dossier.billingDeadline,
  });
  const openRequirementsCount = dossier.claims.reduce((sum, c) => sum + c.openRequirements.length, 0);
  const actionableRequestsCount =
    dossier.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).length +
    dossier.claims.reduce((sum, c) => sum + c.documentRequests.filter((r) => UPLOADABLE_STATUSES.includes(r.status)).length, 0);
  const toProvideCount = openRequirementsCount + actionableRequestsCount;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-900">{dossier.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${grantProjectStatusBadgeClass(dossier.status)}`}>
              {dossier.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {dossier.clientName && <span className="mr-2">{dossier.clientName}</span>}
            {dossier.programName && <span>{dossier.programName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>{dossier.claims.length} réclamation{dossier.claims.length !== 1 ? "s" : ""}</span>
          {toProvideCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
              {toProvideCount} à fournir
            </span>
          )}
          <span>{expanded ? "Réduire ▲" : "Détails ▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-neutral-100 px-4 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-neutral-400">Début</p>
              <p className="text-neutral-800">{formatDate(dossier.officialStartDate)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Fin</p>
              <p className="text-neutral-800">{formatDate(dossier.officialEndDate)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-neutral-400">Montant approuvé</p>
              <p className="text-neutral-800">{formatAmount(dossier.approvedGrantAmount)}</p>
            </div>
          </div>

          {billingNarrative && <p className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{billingNarrative}</p>}

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
                <div className="space-y-2">
                  {dossier.billingLineItems.map((it) => (
                    <div key={it.id} className={`rounded-md border border-neutral-100 p-3 text-sm ${it.includedInBilling ? "" : "opacity-70"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-neutral-900">{it.label}</span>
                        <span className="flex items-center gap-2 text-xs text-neutral-500">
                          {it.hours != null && <span>{it.hours} h</span>}
                          {!it.includedInBilling && <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">Non facturé</span>}
                        </span>
                      </div>
                      {it.description && <p className="mt-1 text-xs text-neutral-500">{it.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Aucune réclamation pour l&apos;instant.</p>
            )}
          </div>

          {dossier.documentRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Documents demandés</h3>
              <div className="space-y-2">
                {dossier.documentRequests.map((r) => (
                  <DocumentRequestItem key={r.id} request={r} />
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

          <PortalNotes grantProjectId={dossier.id} clientId={dossier.clientId} notes={dossier.notes} currentOrgUserId={currentOrgUserId} />
        </div>
      )}
    </div>
  );
}
