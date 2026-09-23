import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { GrantsFilterTable } from "./GrantsFilterTable";

export default async function GrantsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const projects = await grantProjectsService(supabase).list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Projets de subvention</h1>
        <Link href="/grants/new" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
          + Nouveau projet
        </Link>
      </div>

      <GrantsFilterTable projects={projects ?? []} isAdmin={ctx.role === "admin"} />
    </div>
  );
}
