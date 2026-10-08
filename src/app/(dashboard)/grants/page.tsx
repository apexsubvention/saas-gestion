import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { GrantsFilterTable } from "./GrantsFilterTable";
import { portalActivityService } from "@/server/services/portalActivity.service";
import { PortalActivityPanel } from "./PortalActivityPanel";

export default async function GrantsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  // Résumé de l'activité des clients dans le portail (0076) -- jamais bloquant pour la page.
  const [projects, portalActivity] = await Promise.all([
    grantProjectsService(supabase).list(),
    portalActivityService(supabase).listRecent().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Projets de subvention</h1>
        <Link href="/grants/new" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
          + Nouveau projet
        </Link>
      </div>

      <PortalActivityPanel items={portalActivity} />

      <GrantsFilterTable projects={projects ?? []} isAdmin={ctx.role === "admin"} />
    </div>
  );
}
