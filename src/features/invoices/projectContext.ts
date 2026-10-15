// Résumé du projet déposé/accepté, envoyé avec chaque facture lue (0078, Jade) pour vérifier que
// ce qui est inscrit sur la facture concorde avec le projet : activités acceptées (convention),
// budget déposé (« Ce qui a été déposé »), mentions exigées par fournisseur, conditions
// particulières de l'entente, texte suggéré pour le versement. Fonction pure.

export type ProjectContextInput = {
  projectName: string;
  programName: string | null;
  clientNames: string[];
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string;
  activities: Array<{ label: string; description: string | null; amount: number | null; hours: number | null; included: boolean }>;
  budgetLines: Array<{ category: string; deposited: number | null; accepted: number | null; supplierName: string | null }>;
  suppliers: Array<{ name: string; requirements: string | null }>;
  specialConditions: string | null;
  installmentText: string | null;
};

const money = (n: number) => `${Math.round(n * 100) / 100} $`;

/** null quand rien du projet déposé n'est connu (ni convention lue, ni budget déposé, ni exigences) -- pas de comparaison de contenu possible. */
export function buildProjectContext(p: ProjectContextInput): string | null {
  const hasSubstance =
    p.activities.length > 0 || p.budgetLines.length > 0 || p.suppliers.some((s) => s.requirements) || !!p.specialConditions || !!p.installmentText;
  if (!hasSubstance) return null;

  const lines: string[] = [];
  lines.push(`Projet : ${p.projectName}${p.programName ? ` (programme : ${p.programName})` : ""}`);
  if (p.clientNames.length) lines.push(`Entreprise bénéficiaire (à qui les factures doivent être adressées) : ${p.clientNames.join(" ou ")}`);
  if (p.periodStart || p.periodEnd) lines.push(`Dates (${p.periodLabel}) : du ${p.periodStart ?? "?"} au ${p.periodEnd ?? "?"}`);

  if (p.activities.length) {
    lines.push("", "Activités / postes acceptés dans la convention :");
    for (const a of p.activities.slice(0, 40)) {
      const facts = [a.amount != null ? money(a.amount) : null, a.hours != null ? `${a.hours} h` : null, a.included ? null : "coût interne, non facturé"].filter(Boolean).join(", ");
      lines.push(`- ${a.label}${a.description ? ` : ${a.description}` : ""}${facts ? ` (${facts})` : ""}`);
    }
  }
  if (p.budgetLines.length) {
    lines.push("", "Budget déposé (ce qui a été déposé au programme) :");
    for (const b of p.budgetLines.slice(0, 40)) {
      const facts = [b.deposited != null ? `déposé ${money(b.deposited)}` : null, b.accepted != null ? `accepté ${money(b.accepted)}` : null, b.supplierName ? `fournisseur ${b.supplierName}` : null].filter(Boolean).join(", ");
      lines.push(`- ${b.category}${facts ? ` (${facts})` : ""}`);
    }
  }
  const reqs = p.suppliers.filter((s) => s.requirements);
  if (reqs.length) {
    lines.push("", "Mentions exigées sur les factures, par fournisseur :");
    for (const s of reqs) lines.push(`- ${s.name} : ${s.requirements}`);
  }
  if (p.specialConditions) lines.push("", `Conditions particulières de l'entente : ${p.specialConditions}`);
  if (p.installmentText) lines.push("", `Texte prévu sur la facture pour ce versement : ${p.installmentText}`);
  return lines.join("\n");
}
