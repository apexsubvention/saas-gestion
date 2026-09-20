import { createClient } from "@/lib/supabase/server";
import { tasksListAll } from "@/server/repositories/tasks.repository";
import { claimsListAll } from "@/server/repositories/claims.repository";
import { milestonesListAll } from "@/server/repositories/milestones.repository";
import { claimRequirementsService } from "@/server/services/claimRequirements.service";
import { buildScheduleRows } from "@/features/schedule/buildScheduleRows";
import { ScheduleTabs } from "./ScheduleTabs";

// Vue globale de l'échéancier : tâches actives, réclamations et échéances de convention
// de tous les dossiers, réunies en un tableau de travail priorisé (vues Priorités et
// Kanban, plus l'ancienne liste chronologique en 3e onglet) -- voir
// src/features/schedule/ pour le calcul des seaux d'urgence et la fusion des trois
// sources. La création et le changement de statut détaillé se font depuis la fiche du
// dossier concerné ; les vues Priorités/Kanban permettent en plus de marquer un item
// terminé ou de le reprogrammer directement.
export default async function EcheancierPage() {
  const supabase = await createClient();
  const [tasks, claims, milestones] = await Promise.all([
    tasksListAll(supabase)(),
    claimsListAll(supabase)(),
    milestonesListAll(supabase)(),
  ]);

  const claimIds = (claims ?? []).map((c: any) => c.id);
  const missingCountByClaimId = await claimRequirementsService(supabase).countOpenByClaimIds(claimIds);

  const entries = buildScheduleRows({
    tasks: (tasks ?? []) as any,
    milestones: (milestones ?? []) as any,
    claims: (claims ?? []) as any,
    missingCountByClaimId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Échéancier</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ce qui demande ton attention, tous dossiers confondus : tâches actives, réclamations et échéances de
          convention. La création et les détails se font depuis la fiche du dossier concerné.
        </p>
      </div>
      <ScheduleTabs entries={entries} />
    </div>
  );
}
