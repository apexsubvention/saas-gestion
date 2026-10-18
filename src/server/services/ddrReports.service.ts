import type { SupabaseClient } from "@supabase/supabase-js";
import { ddrReportsRepository, type DdrReportRow, type DdrObjectiveSnapshot, type DdrReportUpdate } from "@/server/repositories/ddrReports.repository";
import { grantProjectObjectivesRepository } from "@/server/repositories/grantProjectObjectives.repository";
import { computeDdrPeriods, suggestProgressPercent } from "@/features/ddr/schedule";
import { draftDdrBatch, type DdrPeriodToGenerate } from "@/features/ddr/generateDdr";
import type { ImportedDdrStatusReport } from "@/features/ddr/importStatusReport";

const PROGRESS_END = 95; // même plafond que suggestProgressPercent (jamais 100 % avant la fin)

// % d'avancement qui CONTINUE depuis le dernier DDR déposé (Jade) : de son % vers 95 % au dernier
// DDR du calendrier, au lieu de repartir de la rampe par défaut (15 % au DDR 1).
function continuedPercent(prevPercent: number, prevNumber: number, ddrNumber: number, lastNumber: number): number {
  if (lastNumber <= prevNumber) return Math.max(prevPercent, PROGRESS_END);
  const frac = (ddrNumber - prevNumber) / (lastNumber - prevNumber);
  return Math.round(Math.min(PROGRESS_END, prevPercent + (Math.max(PROGRESS_END, prevPercent) - prevPercent) * frac));
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function ddrReportsService(supabase: SupabaseClient) {
  const repo = ddrReportsRepository(supabase);
  const objectivesRepo = grantProjectObjectivesRepository(supabase);

  // Rédige (IA, best-effort) puis insère un lot de périodes. Si la rédaction échoue (clé API
  // absente, panne, timeout), le calendrier est quand même créé -- vide, modifiable à la main --
  // plutôt que de bloquer la création du calendrier sur une panne de l'IA.
  async function draftAndInsert(input: {
    organizationId: string;
    grantProjectId: string;
    clientName: string;
    programName: string;
    projectName: string;
    externalProjectNumber: string | null;
    projectContext: string | null;
    periods: { ddr_number: number; period_start: string; period_end: string }[];
    objectives: { id: string; label: string }[];
    totalCount: number;
    priorSummary: string | null;
    // Dernier DDR déposé : % d'avancement de chaque objectif (même ordre que objectives).
    progressFrom?: { ddrNumber: number; percents: Array<number | null> } | null;
  }): Promise<DdrReportRow[]> {
    const lastNumber = input.periods.length ? input.periods[input.periods.length - 1]!.ddr_number : input.totalCount;
    const periodsToGenerate: DdrPeriodToGenerate[] = input.periods.map((p) => ({
      ddr_number: p.ddr_number,
      period_start: p.period_start,
      period_end: p.period_end,
      objectives: input.objectives.map((o, i) => {
        const prev = input.progressFrom?.percents[i];
        return {
          label: o.label,
          progress_percent:
            prev != null && input.progressFrom
              ? continuedPercent(prev, input.progressFrom.ddrNumber, p.ddr_number, lastNumber)
              : suggestProgressPercent(p.ddr_number, input.totalCount),
        };
      }),
    }));

    let drafted: Awaited<ReturnType<typeof draftDdrBatch>> = [];
    try {
      drafted = await draftDdrBatch({
        clientName: input.clientName,
        programName: input.programName,
        projectName: input.projectName,
        externalProjectNumber: input.externalProjectNumber,
        projectContext: input.projectContext,
        periods: periodsToGenerate,
        priorSummary: input.priorSummary,
      });
    } catch {
      drafted = [];
    }
    const byNumber = new Map(drafted.map((d) => [d.ddr_number, d]));

    const rows = periodsToGenerate.map((p) => {
      const d = byNumber.get(p.ddr_number);
      const objectivesSnapshot: DdrObjectiveSnapshot[] = input.objectives.map((o, i) => ({
        objective_id: o.id,
        label: o.label,
        progress_percent: p.objectives[i]?.progress_percent ?? null,
        narrative: d?.objectives.find((x) => x.label === o.label)?.narrative ?? d?.objectives[i]?.narrative ?? "",
      }));
      return {
        organization_id: input.organizationId,
        grant_project_id: input.grantProjectId,
        ddr_number: p.ddr_number,
        period_start: p.period_start,
        period_end: p.period_end,
        activities_text: d?.activities_text ?? null,
        variations_text: d?.variations_text ?? null,
        objectives_snapshot: objectivesSnapshot,
        generated_by: "ai" as const,
      };
    });

    return repo.insertMany(rows);
  }

  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    // Génération initiale : crée tout le calendrier de N DDR couvrant [projectStart, projectEnd].
    // Refuse si des DDR existent déjà pour ce dossier -- regenerateRemaining() sert à en ajuster le nombre.
    async generateSchedule(params: {
      organizationId: string;
      grantProjectId: string;
      clientName: string;
      programName: string;
      projectName: string;
      externalProjectNumber: string | null;
      projectContext: string | null;
      projectStart: string;
      projectEnd: string;
      count: number;
      // Jade : projet PARI commencé AVANT Apex -- des DDR ont déjà été déposés hors du logiciel.
      // La série reprend le lendemain de la fin du dernier DDR déposé, numérotée à la suite
      // (ex. dernier = DDR 6 -> on génère DDR 7, 8...). Absent = calendrier complet depuis le début.
      resumeAfter?: { ddrNumber: number; periodEnd: string } | null;
    }): Promise<DdrReportRow[]> {
      const existing = await repo.listByProject(params.grantProjectId);
      if (existing.length > 0) throw new Error("Des DDR existent déjà pour ce dossier -- utilise « Ajuster le nombre de DDR restants » pour les modifier.");
      const objectives = await objectivesRepo.listByProject(params.grantProjectId);
      if (objectives.length === 0) throw new Error("Ajoute d'abord au moins un objectif du projet.");
      if (params.count <= 0) throw new Error("Le nombre de DDR doit être d'au moins 1.");

      const resume = params.resumeAfter ?? null;
      if (resume && resume.periodEnd >= params.projectEnd) throw new Error("Le dernier DDR déposé se termine déjà à la fin du projet (ou après) : il n'y a plus de DDR à générer.");
      const periods = resume
        ? computeDdrPeriods(addOneDay(resume.periodEnd), params.projectEnd, params.count, resume.ddrNumber + 1)
        : computeDdrPeriods(params.projectStart, params.projectEnd, params.count, 1);
      return draftAndInsert({
        organizationId: params.organizationId,
        grantProjectId: params.grantProjectId,
        clientName: params.clientName,
        programName: params.programName,
        projectName: params.projectName,
        externalProjectNumber: params.externalProjectNumber,
        projectContext: params.projectContext,
        periods,
        objectives: objectives.map((o) => ({ id: o.id, label: o.label })),
        // % d'avancement : la rampe tient compte des DDR déjà déposés hors d'Apex.
        totalCount: (resume?.ddrNumber ?? 0) + params.count,
        priorSummary: null,
      });
    },

    // Ajuste le nombre de DDR RESTANTS : l'entreprise ne dépose pas à chaque période prévue, donc
    // moins de DDR mais plus longs pour couvrir la même fin de projet. Les DDR déjà « submitted »
    // (déposés) sont TOUJOURS préservés tels quels ; seuls les « draft » sont remplacés, et la
    // nouvelle série reprend à la date du lendemain du dernier DDR déposé.
    async regenerateRemaining(params: {
      organizationId: string;
      grantProjectId: string;
      clientName: string;
      programName: string;
      projectName: string;
      externalProjectNumber: string | null;
      projectContext: string | null;
      projectEnd: string;
      newRemainingCount: number;
    }): Promise<DdrReportRow[]> {
      if (params.newRemainingCount <= 0) throw new Error("Le nombre de DDR restants doit être d'au moins 1.");
      const existing = await repo.listByProject(params.grantProjectId);
      const locked = existing.filter((r) => r.status === "submitted").sort((a, b) => a.ddr_number - b.ddr_number);
      const drafts = existing.filter((r) => r.status === "draft");

      const remainingStart = locked.length > 0 ? addOneDay(locked[locked.length - 1]!.period_end) : drafts.length > 0 ? drafts.sort((a, b) => a.ddr_number - b.ddr_number)[0]!.period_start : null;
      if (!remainingStart) throw new Error("Aucun calendrier de DDR existant : utilise plutôt « Générer les DDR » pour créer le calendrier initial.");

      const objectives = await objectivesRepo.listByProject(params.grantProjectId);
      // Numérotation à la suite du DDR déposé le plus élevé (pas du nombre de DDR déposés) : un
      // DDR importé d'avant Apex peut être le n°3 sans que les n°1 et 2 soient dans Apex.
      const lastLocked = locked[locked.length - 1] ?? null;
      const lastLockedNumber = lastLocked?.ddr_number ?? 0;
      const periods = computeDdrPeriods(remainingStart, params.projectEnd, params.newRemainingCount, lastLockedNumber + 1);

      for (const d of drafts) await repo.remove(d.id);

      const priorSummary = locked[locked.length - 1]?.activities_text ?? null;
      return draftAndInsert({
        organizationId: params.organizationId,
        grantProjectId: params.grantProjectId,
        clientName: params.clientName,
        programName: params.programName,
        projectName: params.projectName,
        externalProjectNumber: params.externalProjectNumber,
        projectContext: params.projectContext,
        periods,
        objectives: objectives.map((o) => ({ id: o.id, label: o.label })),
        totalCount: lastLockedNumber + params.newRemainingCount,
        priorSummary,
        progressFrom: lastLocked
          ? {
              ddrNumber: lastLocked.ddr_number,
              percents: objectives.map((o, i) => {
                const snap = lastLocked.objectives_snapshot.find((s) => s.objective_id === o.id) ?? lastLocked.objectives_snapshot[i];
                return snap?.progress_percent ?? null;
              }),
            }
          : null,
      });
    },

    // Importer un DDR déjà DÉPOSÉ avant Apex (rapport d'état lu) : enregistré « déposé », il sert
    // ensuite de point de départ à « Ajuster les DDR restants » (numéro, date, texte, % d'avancement).
    // Un brouillon portant le même numéro est remplacé ; un DDR déjà déposé ne l'est jamais.
    async importSubmitted(params: { organizationId: string; grantProjectId: string; report: ImportedDdrStatusReport }): Promise<DdrReportRow> {
      const r = params.report;
      if (r.ddr_number == null) throw new Error("Numéro de la demande de remboursement introuvable dans le rapport.");
      if (!r.period_end) throw new Error("Période visée du rapport (date de fin) introuvable dans le rapport.");
      const existing = await repo.listByProject(params.grantProjectId);
      const same = existing.find((d) => d.ddr_number === r.ddr_number);
      if (same?.status === "submitted") throw new Error(`Le DDR ${r.ddr_number} est déjà enregistré comme déposé dans Apex.`);
      if (same) await repo.remove(same.id);

      const objectives = await objectivesRepo.listByProject(params.grantProjectId);
      const used = new Set<number>();
      const snapshot: DdrObjectiveSnapshot[] = objectives.length
        ? objectives.map((o, i) => {
            // Objectif du rapport : par libellé (normalisé), sinon par position.
            let j = r.objectives.findIndex((x, k) => !used.has(k) && (norm(x.label).includes(norm(o.label)) || norm(o.label).includes(norm(x.label))));
            if (j < 0 && i < r.objectives.length && !used.has(i)) j = i;
            if (j >= 0) used.add(j);
            const src = j >= 0 ? r.objectives[j] : undefined;
            return { objective_id: o.id, label: o.label, progress_percent: src?.progress_percent ?? null, narrative: src?.narrative ?? "" };
          })
        : r.objectives.map((x) => ({ objective_id: null, label: x.label, progress_percent: x.progress_percent, narrative: x.narrative }));

      const [row] = await repo.insertMany([
        {
          organization_id: params.organizationId,
          grant_project_id: params.grantProjectId,
          ddr_number: r.ddr_number,
          period_start: r.period_start ?? r.period_end,
          period_end: r.period_end,
          activities_text: r.activities_text,
          variations_text: r.variations_text,
          objectives_snapshot: snapshot,
          generated_by: "manual",
        },
      ]);
      return repo.update(row!.id, { status: "submitted" });
    },

    update: (id: string, patch: DdrReportUpdate) => repo.update(id, patch),
    remove: (id: string) => repo.remove(id),
  };
}
