// Quel versement (Aide à la facturation) correspond à une facture ? (Jade) -- pour associer les
// factures du tableau Fournisseurs à « Versement n°1, n°2… ». Fonction pure.
//
// Une facture est rattachée à un versement quand sa date tombe dans la période du versement (ou
// peu après sa fin : une facture est souvent émise juste après la période qu'elle couvre) et/ou
// que son montant avant taxes égale celui prévu. On ne propose que si c'est sans ambiguïté.

export type InstallmentOption = { id: string; number: number; periodStart: string; periodEnd: string; amount: number };

const GRACE_DAYS = 45; // une facture datée jusqu'à 45 jours après la fin de la période compte encore
const AMOUNT_TOLERANCE = 1;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00`) - Date.parse(`${a.slice(0, 10)}T12:00:00`)) / 86_400_000);

export function scoreInstallment(invoice: { date: string | null; amount: number | null }, inst: InstallmentOption): { dateFit: "inside" | "after" | null; amountFit: boolean } {
  let dateFit: "inside" | "after" | null = null;
  if (invoice.date) {
    if (invoice.date >= inst.periodStart && invoice.date <= inst.periodEnd) dateFit = "inside";
    else if (invoice.date > inst.periodEnd && dayDiff(inst.periodEnd, invoice.date) <= GRACE_DAYS) dateFit = "after";
  }
  const amountFit = invoice.amount != null && Math.abs(invoice.amount - inst.amount) <= AMOUNT_TOLERANCE;
  return { dateFit, amountFit };
}

/**
 * Versement suggéré pour une facture, ou null. `taken` = versements déjà associés à une autre
 * facture (jamais proposés deux fois). `confident` = date dans la période ET montant identique :
 * assez sûr pour associer automatiquement à la lecture d'une facture.
 */
export function suggestInstallment(
  invoice: { date: string | null; amount: number | null },
  installments: InstallmentOption[],
  taken: Set<string> = new Set()
): { installment: InstallmentOption; confident: boolean } | null {
  const free = installments.filter((i) => !taken.has(i.id));
  const scored = free.map((inst) => ({ inst, ...scoreInstallment(invoice, inst) }));
  const rank = (s: (typeof scored)[number]) => (s.dateFit === "inside" ? 4 : s.dateFit === "after" ? 2 : 0) + (s.amountFit ? 3 : 0);
  const best = scored.filter((s) => rank(s) > 0).sort((a, b) => rank(b) - rank(a));
  if (best.length === 0) return null;
  // Égalité au meilleur rang = ambigu : on ne devine pas.
  if (best.length > 1 && rank(best[0]!) === rank(best[1]!)) return null;
  const top = best[0]!;
  // Le montant seul ne suffit pas (versements souvent égaux) : il faut aussi une date cohérente.
  if (top.dateFit == null) return null;
  return { installment: top.inst, confident: top.dateFit === "inside" && top.amountFit };
}
