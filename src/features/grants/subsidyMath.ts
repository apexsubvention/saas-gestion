// Subvention restante d'un dossier. Exemple : aide de 50 % (remboursable), projet de 60 000 $ ->
// subvention maximale 30 000 $ ; pour l'atteindre il faut 60 000 $ de dépenses (= 30 000 / 50 %).
// Chaque dépense facturée rapporte « taux x dépense » de subvention, jusqu'au maximum.

export type SubsidyInputs = {
  rate: number | null; // fraction 0-1 (0,5 = 50 %)
  maxSubsidy: number | null; // subvention maximale ; à défaut taux x coût total du projet
  totalProjectCost: number | null;
  spent: number; // dépenses facturées à ce jour (avant taxes)
};

export type SubsidySummary = {
  ready: boolean;
  missing: string | null; // ce qu'il faut renseigner quand le calcul est impossible
  rate: number | null;
  maxSubsidy: number | null;
  requiredSpend: number | null; // dépenses nécessaires pour toucher le maximum
  spent: number;
  earned: number; // subvention déjà « gagnée » par les dépenses facturées
  remaining: number; // subvention restante à aller chercher
  remainingSpend: number; // dépenses encore à engager pour atteindre le maximum
  excessSpend: number; // dépenses au-delà de ce qui est remboursé
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function computeSubsidy(input: SubsidyInputs): SubsidySummary {
  const spent = cents(Math.max(0, input.spent));
  const rate = input.rate != null && input.rate > 0 && input.rate <= 1 ? input.rate : null;
  const maxSubsidy = input.maxSubsidy != null && input.maxSubsidy > 0 ? input.maxSubsidy : rate != null && input.totalProjectCost ? rate * input.totalProjectCost : null;

  const empty = { rate, maxSubsidy: maxSubsidy == null ? null : cents(maxSubsidy), requiredSpend: null, spent, earned: 0, remaining: 0, remainingSpend: 0, excessSpend: 0 };
  if (rate == null) return { ...empty, ready: false, missing: "le taux d'aide (entente ou fiche du dossier)" };
  if (maxSubsidy == null) return { ...empty, ready: false, missing: "le montant maximal de la subvention ou le coût total du projet" };

  const requiredSpend = cents(maxSubsidy / rate);
  const earned = cents(Math.min(maxSubsidy, rate * spent));
  return {
    ready: true,
    missing: null,
    rate,
    maxSubsidy: cents(maxSubsidy),
    requiredSpend,
    spent,
    earned,
    remaining: cents(Math.max(0, maxSubsidy - earned)),
    remainingSpend: cents(Math.max(0, requiredSpend - spent)),
    excessSpend: cents(Math.max(0, spent - requiredSpend)),
  };
}

// Les valeurs de la fiche du dossier l'emportent sur celles de l'entente.
export function resolveSubsidyInputs(
  project: { grant_rate?: number | null; approved_grant_amount?: number | null; total_project_cost?: number | null },
  agreement: { grant_rate?: number | null; grant_amount?: number | null } | null,
  spent: number
): SubsidyInputs {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    rate: num(project.grant_rate) ?? num(agreement?.grant_rate),
    maxSubsidy: num(project.approved_grant_amount) ?? num(agreement?.grant_amount),
    totalProjectCost: num(project.total_project_cost),
    spent,
  };
}
