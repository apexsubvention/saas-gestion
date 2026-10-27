// Section « Résumé » du portail admin (src/app/(dashboard)/resume/page.tsx) : regroupe par DOSSIER
// tout ce qui arrive à échéance bientôt, en deux niveaux de priorité :
//   - Priorité 1 : échéance dans 30 jours ou moins (les éléments en retard y sont inclus) ;
//   - Priorité 2 : échéance dans 31 à 60 jours.
// Au-delà de 60 jours, ou sans date, l'élément n'apparaît pas dans le résumé (il reste visible dans
// « Échéanciers & Tâches »). Pur : aucune dépendance réseau/DB, mêmes conventions de dates que
// priority.ts (chaînes ISO "YYYY-MM-DD" comparées en UTC).

export const PRIORITY_1_DAYS = 30;
export const PRIORITY_2_DAYS = 60;

export type SummaryLevel = 1 | 2;

export type SummaryItemKind = "task" | "milestone" | "claim" | "document" | "project_end";

export type SummaryItem = {
  kind: SummaryItemKind;
  id: string;
  title: string;
  date: string; // toujours présente : un élément sans date est exclu du résumé
  daysLeft: number; // négatif = en retard
  statusLabel: string | null;
  amount: number | null;
  href: string;
};

export type SummaryProject = {
  key: string; // id du dossier, ou "client:<id>" pour un élément rattaché à un client sans dossier
  projectId: string | null;
  projectName: string;
  clientName: string | null;
  programName: string | null;
  level: SummaryLevel; // déterminé par l'élément le plus urgent du dossier
  nextDaysLeft: number;
  overdueCount: number;
  items: SummaryItem[]; // triés du plus urgent au moins urgent
};

export type SummaryInputItem = Omit<SummaryItem, "daysLeft"> & {
  date: string | null;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  programName: string | null;
};

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function daysUntil(dateIso: string, today: Date = todayUTC()): number {
  const date = new Date(dateIso.slice(0, 10) + "T00:00:00Z");
  return Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function summaryLevelForDays(daysLeft: number): SummaryLevel | null {
  if (daysLeft <= PRIORITY_1_DAYS) return 1;
  if (daysLeft <= PRIORITY_2_DAYS) return 2;
  return null;
}

export function buildSummary(input: SummaryInputItem[]): { priority1: SummaryProject[]; priority2: SummaryProject[] } {
  const today = todayUTC();
  const byProject = new Map<string, SummaryProject>();

  for (const raw of input) {
    if (!raw.date) continue;
    const daysLeft = daysUntil(raw.date, today);
    const level = summaryLevelForDays(daysLeft);
    if (level == null) continue;

    const key = raw.projectId ?? (raw.clientId ? `client:${raw.clientId}` : "none");
    let project = byProject.get(key);
    if (!project) {
      project = {
        key,
        projectId: raw.projectId,
        projectName: raw.projectName ?? (raw.projectId ? "Dossier" : "Sans dossier"),
        clientName: raw.clientName,
        programName: raw.programName,
        level,
        nextDaysLeft: daysLeft,
        overdueCount: 0,
        items: [],
      };
      byProject.set(key, project);
    }

    project.items.push({
      kind: raw.kind,
      id: raw.id,
      title: raw.title,
      date: raw.date,
      daysLeft,
      statusLabel: raw.statusLabel,
      amount: raw.amount,
      href: raw.href,
    });
    if (daysLeft < 0) project.overdueCount += 1;
    if (daysLeft < project.nextDaysLeft) project.nextDaysLeft = daysLeft;
    if (level < project.level) project.level = level;
  }

  const projects = [...byProject.values()];
  for (const p of projects) p.items.sort((a, b) => a.daysLeft - b.daysLeft);
  projects.sort((a, b) => a.nextDaysLeft - b.nextDaysLeft);

  return {
    priority1: projects.filter((p) => p.level === 1),
    priority2: projects.filter((p) => p.level === 2),
  };
}

export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "Aujourd'hui";
  if (daysLeft === 1) return "Demain";
  if (daysLeft > 1) return `Dans ${daysLeft} jours`;
  const late = Math.abs(daysLeft);
  return late === 1 ? "En retard d'un jour" : `En retard de ${late} jours`;
}
