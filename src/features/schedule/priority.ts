// Calcul du "seau" d'urgence d'un item d'échéancier (tâche/jalon/réclamation), utilisé
// par les vues Priorités et Kanban. Pur : ne dépend d'aucun accès réseau/DB, seulement
// de la date de l'item et de si son statut est terminal, pour rester facilement
// vérifiable et réutilisable des deux côtés (vue globale + vue par dossier).
//
// Convention de dates : mêmes chaînes ISO "YYYY-MM-DD" (dates civiles, sans heure) que
// suggestMilestones.ts -- comparées en UTC pour éviter tout décalage de fuseau horaire
// entre le serveur et l'affichage.

export type PriorityBucket = "overdue" | "this_week" | "next_2_weeks" | "this_month" | "later" | "done" | "no_date";

// Ordre d'affichage voulu pour les vues Priorités/Kanban.
export const PRIORITY_BUCKET_ORDER: PriorityBucket[] = [
  "overdue",
  "this_week",
  "next_2_weeks",
  "this_month",
  "later",
  "no_date",
  "done",
];

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetweenUTC(fromIso: string, toDate: Date): number {
  const from = new Date(fromIso + "T00:00:00Z");
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((from.getTime() - toDate.getTime()) / msPerDay);
}

function isEndOfCurrentMonthOrEarlier(dateIso: string, today: Date): boolean {
  const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const date = new Date(dateIso + "T00:00:00Z");
  return date.getTime() <= endOfMonth.getTime();
}

// isTerminal = statut de fin (task: done/cancelled ; milestone: done/cancelled ;
// claim: paid/rejected) -- prime toujours sur la date : un item terminé n'est jamais
// "en retard".
export function computePriorityBucket(dateIso: string | null, isTerminal: boolean): PriorityBucket {
  if (isTerminal) return "done";
  if (!dateIso) return "no_date";

  const today = todayUTC();
  const diffDays = daysBetweenUTC(dateIso, today); // négatif si dans le passé

  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "this_week";
  if (diffDays <= 14) return "next_2_weeks";
  if (isEndOfCurrentMonthOrEarlier(dateIso, today)) return "this_month";
  return "later";
}

// Texte "Échéance dans 7 jours" / "En retard de 3 jours" / "Aujourd'hui", utilisé par
// les cartes de la vue Priorités.
export function formatRelativeDueText(dateIso: string | null, isTerminal: boolean): string {
  if (isTerminal) return "Terminé";
  if (!dateIso) return "Sans date";

  const today = todayUTC();
  const diffDays = daysBetweenUTC(dateIso, today);

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays > 0) return diffDays === 1 ? "Échéance demain" : `Échéance dans ${diffDays} jours`;
  const late = Math.abs(diffDays);
  return late === 1 ? "En retard d'un jour" : `En retard de ${late} jours`;
}

// Date "représentative" utilisée quand on glisse une carte Kanban vers une colonne de
// date (pas "Terminé") -- ancre raisonnable à l'intérieur du seau cible. Ne s'applique
// jamais au seau "done"/"no_date" (gérés séparément par les actions serveur).
export function representativeDateForBucket(bucket: Exclude<PriorityBucket, "done" | "no_date">): string {
  const today = todayUTC();
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  switch (bucket) {
    case "overdue":
      return addDays(-1);
    case "this_week":
      return addDays(3);
    case "next_2_weeks":
      return addDays(10);
    case "this_month": {
      const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      const mid = new Date((today.getTime() + endOfMonth.getTime()) / 2);
      return mid.toISOString().slice(0, 10);
    }
    case "later":
      return addDays(45);
  }
}
