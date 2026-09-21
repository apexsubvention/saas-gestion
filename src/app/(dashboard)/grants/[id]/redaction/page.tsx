import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { programsRepository } from "@/server/repositories/programs.repository";
import { draftingService } from "@/server/services/drafting.service";
import { draftingAvailable } from "@/features/drafting/analyze";
import { DraftingWorkspace } from "./DraftingWorkspace";
import { QuestionnairePanel } from "./QuestionnairePanel";
import { questionnaireService } from "@/server/services/questionnaire.service";

// L'analyse d'un projet lit les documents du programme : jusqu'à ~1 minute.
export const maxDuration = 60;

export default async function DraftingPage({ params }: { params: { id: string } }) {
  await requireOrgContext();
  const supabase = await createClient();
  const project: any = await grantProjectsService(supabase).get(params.id);
  if (!project) notFound();

  const questionnaire = await questionnaireService(supabase).get(params.id);
  const [program, history, clientRes] = await Promise.all([
    programsRepository(supabase).findById(project.program_id),
    draftingService(supabase).listAnalyses(params.id),
    supabase.from("clients").select("current_needs").eq("id", project.client_id).maybeSingle(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/grants/${params.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← Retour au dossier</Link>
        <h1 className="mt-2 text-lg font-semibold text-neutral-900">Aide à la rédaction — {project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {project.clients?.name ?? "Client"} · {program?.name ?? project.grant_programs?.name ?? "Programme"}. Apex connaît le client, le dossier et les documents du programme ;
          il ne suppose jamais une information manquante et ne rend jamais un projet admissible en inventant un fait.
        </p>
      </div>
      <DraftingWorkspace
        grantProjectId={params.id}
        initialText={(clientRes.data as { current_needs: string | null } | null)?.current_needs ?? ""}
        history={history}
        programDocuments={program?.required_documents ?? []}
        configured={draftingAvailable()}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900">5. Questionnaire de la demande et copilote de rédaction</h2>
        {draftingAvailable() ? (
          <QuestionnairePanel grantProjectId={params.id} items={questionnaire.items} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">Le questionnaire nécessite la variable <code className="rounded bg-neutral-100 px-1">ANTHROPIC_API_KEY</code> dans Vercel.</p>
        )}
      </section>
    </div>
  );
}
