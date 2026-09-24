import type { SubsidySummary } from "@/features/grants/subsidyMath";

function money(n: number | null) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function Stat({ label, value, hint, strong = false }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-md p-3 ${strong ? "bg-indigo-50 ring-1 ring-indigo-100" : "bg-neutral-50"}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-0.5 font-semibold ${strong ? "text-lg text-indigo-900" : "text-sm text-neutral-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-neutral-400">{hint}</div>}
    </div>
  );
}

// Subvention restante : chaque dollar facturé rapporte « taux x dépense » de subvention, jusqu'au maximum.
// Ex. 50 % sur un projet de 60 000 $ -> subvention max 30 000 $, atteinte avec 60 000 $ de dépenses.
export function SubsidyPanel({
  summary,
  supplierBudgetTotal,
  narrative,
}: {
  summary: SubsidySummary;
  supplierBudgetTotal: number;
  // Résumé en langage clair (src/features/billing/billingSummary.ts) -- mêmes chiffres que
  // ci-dessous, en phrase. Demandé par Jade pour comprendre le dossier sans lire un tableau.
  narrative?: string | null;
}) {
  if (!summary.ready) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-500">
        Pour calculer la subvention restante, renseigne {summary.missing}. Le plus simple : enregistre l&apos;entente ci-dessous (montant accordé et taux d&apos;aide).
      </p>
    );
  }

  const ratePct = Math.round((summary.rate ?? 0) * 10000) / 100;
  const budgetGap = summary.requiredSpend != null ? supplierBudgetTotal - summary.requiredSpend : null;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      {narrative && <p className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{narrative}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Taux d'aide" value={`${ratePct.toLocaleString("fr-CA")} %`} />
        <Stat label="Subvention maximale" value={money(summary.maxSubsidy)} />
        <Stat label="Dépenses requises pour l'atteindre" value={money(summary.requiredSpend)} hint={`${money(summary.maxSubsidy)} ÷ ${ratePct} %`} />
        <Stat label="Dépensé à ce jour (factures)" value={money(summary.spent)} />
        <Stat label="Subvention gagnée" value={money(summary.earned)} hint={`${ratePct} % des dépenses facturées`} />
        <Stat label="Subvention restante" value={money(summary.remaining)} strong />
        <Stat label="Dépenses restantes à engager" value={money(summary.remainingSpend)} hint="pour atteindre la subvention maximale" />
        <Stat
          label="Budget des fournisseurs"
          value={money(supplierBudgetTotal)}
          hint={budgetGap == null ? undefined : budgetGap >= 0 ? "couvre les dépenses requises" : `il manque ${money(-budgetGap)} de budget pour atteindre le maximum`}
        />
      </div>
      {summary.excessSpend > 0 && (
        <p className="text-xs text-amber-800">
          Les dépenses dépassent de {money(summary.excessSpend)} ce qui est remboursé : la subvention est déjà à son maximum.
        </p>
      )}
      <p className="text-xs text-neutral-400">
        Calcul sur les montants avant taxes des factures du tableau ci-dessous. Chaque dollar facturé rapporte {ratePct.toLocaleString("fr-CA")} % de subvention, jusqu&apos;au maximum.
      </p>
    </div>
  );
}
