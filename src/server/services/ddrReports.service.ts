import type { SupabaseClient } from "@supabase/supabase-js";
import { ddrReportsRepository, type DdrReportRow, type DdrObjectiveSnapshot, type DdrReportUpdate } from "@/server/repositories/ddrReports.repository";
import { grantProjectObjectivesRepository } from "@/server/repositories/grantProjectObjectives.repository";
import { computeDdrPeriods, suggestProgressPercent } from "@/features/ddr/schedule";
import { draftDdrBatch, type DdrPeriodToGenerate } from "@/features/ddr/generateDdr";

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
  }): Promise<DdrReportRow[]> {
    const periodsToGenerate: DdrPeriodToGenerate[] = input.periods.map((p) => ({
      ddr_number: p.ddr_number,
      period_start: p.period_start,
      period_end: p.period_end,
      objectives: input.objectives.map((o) => ({ label: o.label, progress_percent: suggestProgressPercent(p.ddr_number, input.totalCount) })),
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
    }): Promise<DdrReportRow[]> {
      const existing = await repo.listByProject(params.grantProjectId);
      if (existing.length > 0) throw new Error("Des DDR existent déjà pour ce dossier -- utilise « Ajuster le nombre de DDR restants » pour les modifier.");
      const objectives = await objectivesRepo.listByProject(params.grantProjectId);
      if (objectives.length === 0) throw new Error("Ajoute d'abord au moins un objectif du projet.");
      if (params.count <= 0) throw new Error("Le nombre de DDR doit être d'au moins 1.");

      const periods = computeDdrPeriods(params.projectStart, params.projectEnd, params.count, 1);
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
        totalCount: params.count,
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
      const periods = computeDdrPeriods(remainingStart, params.projectEnd, params.newRemainingCount, locked.length + 1);

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
        totalCount: locked.length + params.newRemainingCount,
        priorSummary,
      });
    },

    update: (id: string, patch: DdrReportUpdate) => repo.update(id, patch),
    remove: (id: string) => repo.remove(id),
  };
}
