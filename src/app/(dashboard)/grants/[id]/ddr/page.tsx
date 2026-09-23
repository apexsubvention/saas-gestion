import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { grantAgreementsService } from "@/server/services/grantAgreements.service";
import { grantProjectObjectivesService } from "@/server/services/grantProjectObjectives.service";
import { ddrReportsService } from "@/server/services/ddrReports.service";
import { defaultDdrCount } from "@/features/ddr/schedule";
import { ObjectivesEditor } from "./ObjectivesEditor";
import { ExternalProjectNumberForm } from "./ExternalProjectNumberForm";
import { GenerateScheduleForm } from "./GenerateScheduleForm";
import { DdrReportCard } from "./DdrReportCard";

// Rédaction assistée des DDR (Demandes de remboursement, PARI CNRC / IRAP) : un rapport
// d'avancement par période, dont Apex pré-rédige le contenu (activités, avancement par
// objectif, variations) à partir des objectifs du projet et des dates de l'entente -- éditable
// section par section, avec bouton « copier » (à coller dans le formulaire officiel / le
// Portail de l'innovation). Voir supabase/migrations/0041_ddr_pari_cnrc.sql et
// src/server/services/ddrReports.service.ts pour le calendrier et la logique de régénération.
export const maxDuration = 90;

export default async function DdrPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(params.id);
  if (!project) notFound();

  const [agreements, objectives, reports] = await Promise.all([
    grantAgreementsService(supabase).listByProject(params.id),
    grantProjectObjectivesService(supabase).listByProject(params.id),
    ddrReportsService(supabase).listByProject(params.id),
  ]);
  const agreement = agreements[0] ?? null;
  const projectStart = agreement?.project_start ?? project.official_start_date ?? null;
  const projectEnd = agreement?.project_end ?? project.official_end_date ?? null;

  const lockedCount = reports.filter((r) => r.status === "submitted").length;
  const draftCount = reports.filter((r) => r.status === "draft").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/grants/${params.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Retour au dossier
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">DDR — {project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Demandes de remboursement (PARI CNRC / IRAP) : une par période, jusqu&apos;à la fin du projet. Apex prérédige chaque section
          à partir des objectifs ci-dessous — modifie-les librement, puis copie chaque section dans le formulaire officiel ou le
          Portail de l&apos;innovation.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Numéro de projet</h2>
          <ExternalProjectNumberForm grantProjectId={params.id} initialValue={project.external_project_number ?? ""} />
        </div>
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          <h2 className="text-sm font-semibold text-neutral-900">Dates du projet</h2>
          {projectStart && projectEnd ? (
            <p>Du {projectStart} au {projectEnd} (source : {agreement ? "entente" : "dossier"}).</p>
          ) : (
            <p className="text-amber-700">
              Dates de début/fin manquantes — renseigne-les dans l&apos;entente du dossier avant de générer les DDR.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Objectifs du projet</h2>
        <p className="text-xs text-neutral-500">
          Un objectif par ligne (reprends le libellé complet, avec valeur de départ et cible — ex. « Augmenter le taux de
          conversion autonome de 10 % à au moins 20 % »). Repris tel quel dans chaque DDR, avec un % d&apos;avancement qui évolue.
        </p>
        <ObjectivesEditor grantProjectId={params.id} initialObjectives={objectives.map((o) => o.label)} />
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Calendrier des DDR</h2>
        {reports.length === 0 ? (
          <>
            <p className="text-xs text-neutral-500">
              Génère le calendrier complet : Apex répartit la durée du projet en périodes consécutives et rédige un premier
              brouillon de chaque DDR.
            </p>
            <GenerateScheduleForm
              grantProjectId={params.id}
              mode="generate"
              disabled={!projectStart || !projectEnd || objectives.length === 0}
              defaultCount={projectStart && projectEnd ? defaultDdrCount(projectStart, projectEnd) : 8}
            />
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              {lockedCount} DDR marqué(s) déposé(s), {draftCount} en brouillon. Si le rythme réel diffère (l&apos;entreprise ne
              dépose pas à chaque période), ajuste ici le nombre de DDR RESTANTS — les DDR déjà marqués déposés ne sont jamais
              touchés, seuls les brouillons sont régénérés à partir de la période suivante.
            </p>
            <GenerateScheduleForm grantProjectId={params.id} mode="regenerate" disabled={!projectEnd} defaultCount={Math.max(1, draftCount)} />
          </>
        )}
      </section>

      <section className="space-y-4">
        {reports.map((r) => (
          <DdrReportCard key={r.id} grantProjectId={params.id} report={r} />
        ))}
        {reports.length === 0 && <p className="text-sm text-neutral-400">Aucun DDR généré pour l&apos;instant.</p>}
      </section>
    </div>
  );
}
