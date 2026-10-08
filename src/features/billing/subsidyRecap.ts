// « Résumé de la subvention approuvée » pour le portail client (Jade) : en langage simple, ce que
// le client doit DÉBOURSER pour obtenir le remboursement, ce qu'il RECEVRA, et ce que ça lui coûte
// vraiment. Les clients ne lisent pas le tableau Fournisseurs comme Apex -- ce récapitulatif
// reprend exactement les mêmes chiffres (Budget prévu / Subvention acceptée de chaque fournisseur,
// postes de salaire interne de la convention), sans jamais en inventer.
//
// Fonction pure (aucun accès base) -- testable avec les chiffres d'un vrai dossier.

export type RecapSupplierInput = {
  name: string;
  isEmployee: boolean; // salarié interne (PARI, 0065) plutôt qu'un fournisseur externe
  toPay: number | null; // Budget prévu (effectif)
  reimbursed: number | null; // Subvention acceptée (effective)
};

export type RecapLineItemInput = {
  label: string;
  amount: number;
  includedInBilling: boolean;
  exclusionReason: string | null;
  supplierId: string | null;
  subsidyRate: number | null; // fraction 0-1
};

export type RecapLine = {
  kind: "fees" | "salary";
  label: string; // « Honoraires de Sitegrow », « Salaire admissible -- Employée en formation »
  reimbursedLabel: string; // « Pour les honoraires de Sitegrow », « Pour le salaire -- ... »
  toPay: number;
  reimbursed: number;
};

export type SubsidyRecap = {
  lines: RecapLine[];
  totalToPay: number;
  totalReimbursed: number;
  feesToPay: number;
  feesReimbursed: number;
  salaryToPay: number;
  salaryReimbursed: number;
  // Explications en langage clair, dans l'ordre d'affichage.
  notes: string[];
};

const round = (n: number) => Math.round(n * 100) / 100;
export const formatRecapMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function salaryLabel(label: string) {
  const clean = label.trim();
  return /salaire/i.test(clean) ? clean : `Salaire admissible — ${clean}`;
}

// « Salaire de l'employée en formation » -> « Pour le salaire de l'employée en formation ».
function salaryReimbursedLabel(label: string) {
  const clean = label.trim();
  return /^salaire\b/i.test(clean) ? `Pour le s${clean.slice(1)}` : `Pour le salaire (${clean})`;
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export function buildSubsidyRecap(input: {
  suppliers: RecapSupplierInput[];
  lineItems: RecapLineItemInput[];
  projectRate: number | null; // taux du dossier, repli pour un poste de salaire sans taux propre
}): SubsidyRecap | null {
  const lines: RecapLine[] = [];

  // Fournisseurs externes : honoraires (Budget prévu) et leur part remboursée (Subvention acceptée).
  for (const s of input.suppliers) {
    if (s.toPay == null || s.toPay <= 0) continue;
    if (s.reimbursed == null) continue; // remboursement inconnu : on n'affiche rien plutôt qu'un chiffre faux
    if (s.isEmployee) {
      lines.push({ kind: "salary", label: salaryLabel(s.name), reimbursedLabel: `Pour le salaire de ${s.name}`, toPay: round(s.toPay), reimbursed: round(s.reimbursed) });
    } else {
      lines.push({ kind: "fees", label: `Honoraires de ${s.name}`, reimbursedLabel: `Pour les honoraires de ${s.name}`, toPay: round(s.toPay), reimbursed: round(s.reimbursed) });
    }
  }

  // Salaire interne (poste de la convention décoché « Salaire interne (non facturé) », 0058) :
  // personne ne le facture, mais l'entreprise le paie et il est remboursé à son taux.
  for (const it of input.lineItems) {
    if (it.includedInBilling || it.exclusionReason !== "internal_salary" || it.supplierId) continue;
    const rate = it.subsidyRate ?? input.projectRate;
    if (rate == null || !(it.amount > 0)) continue;
    const label = salaryLabel(it.label);
    lines.push({ kind: "salary", label, reimbursedLabel: salaryReimbursedLabel(it.label), toPay: round(it.amount), reimbursed: round(it.amount * rate) });
  }

  if (lines.length === 0) return null;

  const sum = (kind: RecapLine["kind"] | null, key: "toPay" | "reimbursed") =>
    round(lines.filter((l) => kind == null || l.kind === kind).reduce((s, l) => s + l[key], 0));
  const feesToPay = sum("fees", "toPay");
  const feesReimbursed = sum("fees", "reimbursed");
  const salaryToPay = sum("salary", "toPay");
  const salaryReimbursed = sum("salary", "reimbursed");

  const notes: string[] = [];
  if (salaryReimbursed > 0) {
    notes.push(
      `À noter : les ${formatRecapMoney(salaryReimbursed)} remboursés sur le salaire sont un vrai bonus, puisque ce salaire aurait de toute façon été versé pendant cette période. Ce remboursement vient donc directement réduire le coût réel du projet pour l'entreprise.`
    );
  }
  if (feesToPay > 0) {
    const names = joinNames(lines.filter((l) => l.kind === "fees").map((l) => l.label.replace(/^Honoraires de /, "")));
    const feesNet = round(feesToPay - feesReimbursed);
    notes.push(
      `Si on regarde uniquement les honoraires de ${names}, tu débourses ${formatRecapMoney(feesToPay)} et tu récupères ${formatRecapMoney(feesReimbursed)} : ils te reviennent réellement à ${formatRecapMoney(feesNet)}.`
    );
    if (salaryReimbursed > 0 && feesNet > 0) {
      const netAfterSalary = round(feesNet - salaryReimbursed);
      if (Math.abs(netAfterSalary) <= Math.max(25, feesNet * 0.05)) {
        notes.push(`Et comme tu récupères aussi ${formatRecapMoney(salaryReimbursed)} sur le salaire, le coût net est pratiquement entièrement compensé.`);
      } else if (netAfterSalary < 0) {
        notes.push(`Et comme tu récupères aussi ${formatRecapMoney(salaryReimbursed)} sur le salaire, ce remboursement couvre plus que le coût net des honoraires.`);
      } else {
        notes.push(`Et comme tu récupères aussi ${formatRecapMoney(salaryReimbursed)} sur le salaire, le coût net pour l'entreprise descend à environ ${formatRecapMoney(netAfterSalary)}.`);
      }
    }
  }

  return {
    lines,
    totalToPay: sum(null, "toPay"),
    totalReimbursed: sum(null, "reimbursed"),
    feesToPay,
    feesReimbursed,
    salaryToPay,
    salaryReimbursed,
    notes,
  };
}
