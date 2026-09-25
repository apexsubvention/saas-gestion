"use client";

// Carte "Facturation à préparer" (0047) -- remplace l'ancien tableau plat : Jade a demandé
// que les comptes fournisseurs/sous-traitants (ex. Sitegrow qui facture pour ses propres
// clients finaux, project_suppliers.supplier_client_id) voient, en plus de leur ligne de
// facturation, le budget total du dossier, la portion de subvention, tous les documents,
// et un total agrégé (jamais le détail) des autres sous-traitants sur le même dossier.
//
// Chargé à la demande (dépliage) via getSupplierDossierDetailsAction -- pas au chargement
// de la page d'accueil, pour ne pas alourdir "Mes dossiers" quand il y a plusieurs lignes
// de facturation.
import { useState, useTransition } from "react";
import { DOCUMENT_CATEGORY_LABELS, grantProjectStatusBadgeClass, GRANT_PROJECT_STATUS_LABELS } from "@/features/grants/constants";
import { getSupplierDossierDetailsAction, type SupplierDossierDetails } from "./supplierActions";
import { PortalOpenDocumentButton } from "./PortalOpenDocumentButton";
import { computeSubsidy } from "@/features/grants/subsidyMath";
import { buildBillingNarrative } from "@/features/billing/billingSummary";

export type SupplierBillingRow = {
  id: string;
  grant_project_id: string;
  budget_amount: number | null;
  billing_frequency: string | null;
  expected_invoice_day: number | null;
  invoice_description_requirements: string | null;
  grant_projects: { name: string | null; clients: { name: string | null } | null; grant_programs: { name: string | null } | null } | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA");
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("fr-CA", { minimumFractionDigits: 2 })} $`;
}

function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(Number(rate) * 100).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`;
}

export function SupplierDossierCard({ row, clientName }: { row: SupplierBillingRow; clientName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<SupplierDossierDetails | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !details) {
      startTransition(async () => {
        const result = await getSupplierDossierDetailsAction(row.grant_project_id);
        setDetails(result);
      });
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-900">{row.grant_projects?.name ?? "Dossier"}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {row.grant_projects?.clients?.name ?? "Client final"}
            {row.grant_projects?.grant_programs?.name && <span className="ml-2">{row.grant_projects.grant_programs.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>Budget prévu : {formatAmount(row.budget_amount)}</span>
          <span>{expanded ? "Réduire ▲" : "Détails ▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-neutral-100 px-4 py-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ta facturation</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-400">Montant prévu</p>
                <p className="text-neutral-800">{formatAmount(row.budget_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400">Fréquence</p>
                <p className="text-neutral-800">{row.billing_frequency ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400">Jour attendu</p>
                <p className="text-neutral-800">{row.expected_invoice_day ?? "—"}</p>
              </div>
              {row.invoice_description_requirements && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-neutral-400">À inscrire sur la facture</p>
                  <p className="text-neutral-800">{row.invoice_description_requirements}</p>
                </div>
              )}
            </div>
          </div>

          {isPending && <p className="text-sm text-neutral-400">Chargement des détails du dossier…</p>}

          {details?.error && <p className="text-sm text-red-600">{details.error}</p>}

          {details?.view && (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Dossier</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-neutral-400">Statut</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${grantProjectStatusBadgeClass(details.view.status)}`}>
                      {GRANT_PROJECT_STATUS_LABELS[details.view.status] ?? details.view.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Programme</p>
                    <p className="text-neutral-800">{details.view.program_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Début</p>
                    <p className="text-neutral-800">{formatDate(details.view.official_start_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Fin</p>
                    <p className="text-neutral-800">{formatDate(details.view.official_end_date)}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Budget du dossier</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-neutral-400">Coût total du projet</p>
                    <p className="text-neutral-800">{formatAmount(details.view.total_project_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Subvention approuvée</p>
                    <p className="text-neutral-800">{formatAmount(details.view.approved_grant_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Taux de subvention</p>
                    <p className="text-neutral-800">{formatRate(details.view.grant_rate)}</p>
                  </div>
                </div>
              </div>

              {(() => {
                const subsidy = computeSubsidy({
                  rate: details.view.grant_rate,
                  maxSubsidy: details.view.approved_grant_amount,
                  totalProjectCost: details.view.total_project_cost,
                  spent: 0,
                });
                const narrative = buildBillingNarrative({
                  clientName: details.view.client_name,
                  subsidy,
                  // Le nom réel du fournisseur (compte portail courant) plutôt que « Vous » : la
                  // phrase reprend la construction « devra avoir facturé » (3e personne), pas
                  // grammaticalement correcte avec un « vous ».
                  billerLabel: clientName,
                  billerAmount: row.budget_amount,
                  deadline: details.view.official_end_date,
                });
                return narrative ? (
                  <p className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{narrative}</p>
                ) : null;
              })()}

              {details.billingInstallments.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Calendrier de facturation</h3>
                  <p className="text-xs text-neutral-400">
                    Montant et texte suggéré pour chaque facture à venir, pour l&apos;ensemble du dossier
                    {details.view.other_suppliers_count > 0 ? " (réparti entre tous les sous-traitants, pas seulement toi)" : ""} —
                    ta part prévue reste {formatAmount(row.budget_amount)} (ci-dessus).
                  </p>
                  <div className="space-y-2">
                    {details.billingInstallments.map((inst) => (
                      <div key={inst.id} className="rounded-md border border-neutral-100 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-neutral-900">
                            Versement n°{inst.installment_number} — {formatDate(inst.period_start)} au {formatDate(inst.period_end)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-neutral-800">{formatAmount(inst.amount)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inst.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                              {inst.status === "submitted" ? "Facturé" : "À venir"}
                            </span>
                          </span>
                        </div>
                        {inst.invoice_description && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{inst.invoice_description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                details.billingLineItems.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">À inscrire sur les factures</h3>
                    <div className="space-y-2">
                      {details.billingLineItems.map((it) => (
                        <div key={it.id} className={`rounded-md border border-neutral-100 p-3 text-sm ${it.included_in_billing ? "" : "opacity-70"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-neutral-900">{it.label}</span>
                            <span className="flex items-center gap-2 text-xs text-neutral-500">
                              {it.hours != null && <span>{it.hours} h</span>}
                              {!it.included_in_billing && <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">Non facturé</span>}
                            </span>
                          </div>
                          {it.description && <p className="mt-1 text-xs text-neutral-500">{it.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Autres sous-traitants</h3>
                <p className="mt-2 text-sm text-neutral-700">
                  {details.view.other_suppliers_count > 0
                    ? `${details.view.other_suppliers_count} autre${details.view.other_suppliers_count > 1 ? "s" : ""} sous-traitant${details.view.other_suppliers_count > 1 ? "s" : ""} sur ce dossier, pour un total de ${formatAmount(details.view.other_suppliers_total)}.`
                    : "Aucun autre sous-traitant connu sur ce dossier."}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Documents du dossier</h3>
                {details.documents.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-neutral-100">
                    <table className="w-full text-sm">
                      <tbody>
                        {details.documents.map((d) => (
                          <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                            <td className="px-3 py-2 text-neutral-900">{d.filename}</td>
                            <td className="px-3 py-2 text-neutral-600">{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</td>
                            <td className="px-3 py-2 text-xs text-neutral-400">{formatDate(d.created_at)}</td>
                            <td className="px-3 py-2 text-right">
                              <PortalOpenDocumentButton documentId={d.id} filename={d.filename} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">Aucun document pour l&apos;instant.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
