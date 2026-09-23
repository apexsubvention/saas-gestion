import { createClient } from "@/lib/supabase/server";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { claimsListAll } from "@/server/repositories/claims.repository";
import { milestonesListAll } from "@/server/repositories/milestones.repository";
import { claimRequirementsService } from "@/server/services/claimRequirements.service";
import { clientsService } from "@/server/services/clients.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { buildScheduleRows } from "@/features/schedule/buildScheduleRows";
import { ScheduleTabs } from "./ScheduleTabs";
import { QuickAddTaskForm } from "./QuickAddTaskForm";

// Vue globale « Échéanciers & Tâches » : tâches actives, réclamations et échéances de convention de
// tous les dossiers, réunies en un tableau de travail priorisé (vues Priorités et Kanban, plus
// l'ancienne liste chronologique en 3e onglet) -- voir src/features/schedule/ pour le calcul des
// seaux d'urgence et la fusion des trois sources. Fusionne ce qui était avant deux entrées de menu
// séparées (Échéancier / Mes tâches, voir Sidebar.tsx). L'ajout et la suppression manuels d'une
// tâche se font directement ici (QuickAddTaskForm / DeleteTaskButton, voir ./actions.ts) ; les
// échéances et réclamations, elles, restent gérées depuis la fiche du dossier concerné.
export default async function EcheancierPage() {
  const supabase = await createClient();
  const [tasks, claims, milestones, clients, projects] = await Promise.all([
    tasksListAll(supabase)(),
    claimsListAll(supabase)(),
    milestonesListAll(supabase)(),
    clientsService(supabase).list(),
    grantProjectsService(supabase).list(),
  ]);

  const claimIds = (claims ?? []).map((c: any) => c.id);
  const missingCountByClaimId = await claimRequirementsService(supabase).countOpenByClaimIds(claimIds);

  const entries = buildScheduleRows({
    tasks: (tasks ?? []) as any,
    milestones: (milestones ?? []) as any,
    claims: (claims ?? []) as any,
    missingCountByClaimId,
  });

  const clientOptions = (clients ?? []).map((c: any) => ({ id: c.id, name: c.name }));
  const projectOptions = (projects ?? []).map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id, programName: p.grant_programs?.name ?? null }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Échéanciers &amp; Tâches</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ce qui demande ton attention, tous dossiers confondus : tâches actives, réclamations et échéances de
            convention. Ajoute ou supprime une tâche manuellement ci-dessous — les échéances et réclamations se
            gèrent depuis la fiche du dossier concerné.
          </p>
        </div>
        <QuickAddTaskForm clients={clientOptions} projects={projectOptions} />
      </div>
      <ScheduleTabs entries={entries} />
    </div>
  );
}
