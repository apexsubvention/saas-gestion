// Heures à inscrire sur chaque facture du calendrier de facturation (Jade) -- calculées par Apex,
// jamais laissées au modèle : les heures d'un versement doivent toujours correspondre à son montant
// au taux horaire de l'activité (ex. 3 000 $ ÷ 150 $/h = 20 h). Les modules sont pris DANS L'ORDRE,
// et un module est coupé entre deux versements au besoin (« 6 h sur 12 h du Module 2 »).
// Fonctions pures.

export type PlanActivity = { label: string; description: string | null; amount: number; hours: number | null };

// Une « unité » = un module (repéré dans la description avec ses heures, ex. « Module 1 - … (14h) »)
// ou, à défaut, l'activité entière.
type Unit = { activity: string; label: string; hours: number | null; dollars: number; rate: number | null };

export type PlanPart = {
  activity: string;
  label: string; // module, ou activité entière
  hours: number | null; // heures de CETTE période (null : activité sans heures connues)
  unitHours: number | null; // heures totales du module/de l'activité
  kind: "full" | "start" | "continue" | "end";
};
export type PeriodPlan = { parts: PlanPart[]; totalHours: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005; // demi-cent

/** Modules lus dans la description : « Module 1 - Nouveau paysage SEO et GEO (14h), Module 2 - … (12 h) ». */
export function parseModules(description: string | null): Array<{ label: string; hours: number }> {
  if (!description) return [];
  const re = /\(\s*(\d+(?:[.,]\d+)?)\s*h(?:eures?|rs?)?\s*\)/gi;
  const out: Array<{ label: string; hours: number }> = [];
  let last = 0;
  for (const m of description.matchAll(re)) {
    const raw = description.slice(last, m.index ?? 0);
    const label = raw.replace(/^[\s,;:.•\-–—]+/, "").replace(/^(et|and)\s+/i, "").replace(/[\s,;:\-–—]+$/, "").trim();
    const hours = Number(m[1]!.replace(",", "."));
    if (label && hours > 0) out.push({ label, hours });
    last = (m.index ?? 0) + m[0].length;
  }
  return out;
}

function unitsOf(a: PlanActivity): Unit[] {
  const hasHours = a.hours != null && a.hours > 0 && a.amount > 0;
  if (!hasHours) return [{ activity: a.label, label: a.label, hours: null, dollars: a.amount, rate: null }];
  const rate = a.amount / (a.hours as number);
  const modules = parseModules(a.description);
  const sum = modules.reduce((s, m) => s + m.hours, 0);
  // On ne découpe en modules que si leurs heures correspondent au total de l'activité.
  if (modules.length > 1 && Math.abs(sum - (a.hours as number)) <= 0.5) {
    return modules.map((m) => ({ activity: a.label, label: m.label, hours: m.hours, dollars: m.hours * rate, rate }));
  }
  return [{ activity: a.label, label: a.label, hours: a.hours, dollars: a.amount, rate }];
}

/**
 * Plan heures/modules pour chaque période. `amounts` = montant de chaque période (même ordre).
 * `alreadyBilled` = dollars déjà couverts par des versements facturés (« Ajuster les versements
 * restants ») : on repart là où ils se sont arrêtés. null si aucune activité n'a d'heures connues.
 */
export function planHours(activities: PlanActivity[], amounts: number[], alreadyBilled = 0): PeriodPlan[] | null {
  const units = activities.flatMap(unitsOf);
  if (!units.some((u) => u.rate != null)) return null;

  // File de dollars restants par unité, après ce qui est déjà facturé.
  const remaining = units.map((u) => u.dollars);
  let skip = alreadyBilled;
  for (let i = 0; i < remaining.length && skip > EPS; i++) {
    const take = Math.min(remaining[i]!, skip);
    remaining[i] = remaining[i]! - take;
    skip -= take;
  }

  let cursor = 0;
  return amounts.map((amount, periodIndex) => {
    const isLast = periodIndex === amounts.length - 1;
    let budget = amount;
    const parts: PlanPart[] = [];
    while (cursor < units.length && (budget > EPS || (isLast && remaining[cursor]! > EPS))) {
      const u = units[cursor]!;
      if (remaining[cursor]! <= EPS) {
        cursor++;
        continue;
      }
      const before = remaining[cursor]!;
      // Dernière période : elle absorbe tout le reste (arrondis compris).
      const take = isLast ? before : Math.min(before, budget);
      remaining[cursor] = before - take;
      budget -= take;
      const startedBefore = before < u.dollars - EPS;
      const finishes = remaining[cursor]! <= EPS;
      const kind: PlanPart["kind"] = !startedBefore && finishes ? "full" : !startedBefore ? "start" : finishes ? "end" : "continue";
      parts.push({ activity: u.activity, label: u.label, hours: u.rate ? round2(take / u.rate) : null, unitHours: u.hours, kind });
      if (finishes) cursor++;
      else break;
    }
    const withHours = parts.filter((p) => p.hours != null);
    return { parts, totalHours: withHours.length ? round2(withHours.reduce((s, p) => s + (p.hours as number), 0)) : null };
  });
}

export const formatHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} h`;

function describePart(p: PlanPart): string {
  if (p.hours == null) return p.label;
  const of = p.unitHours != null ? ` sur ${formatHours(p.unitHours)}` : "";
  switch (p.kind) {
    case "full":
      return `${p.label} (${formatHours(p.hours)})`;
    case "start":
      return `${p.label} — début, ${formatHours(p.hours)}${of}`;
    case "continue":
      return `${p.label} — suite, ${formatHours(p.hours)}${of}`;
    case "end":
      return `${p.label} — fin, ${formatHours(p.hours)}${of}`;
  }
}

/** Liste imposée pour une période (donnée au rédacteur, et texte de repli s'il échoue). */
export function describePlan(plan: PeriodPlan): string {
  const lines = plan.parts.map((p) => `- ${describePart(p)}`);
  if (plan.totalHours != null) lines.push(`Total : ${formatHours(plan.totalHours)}`);
  return lines.join("\n");
}
