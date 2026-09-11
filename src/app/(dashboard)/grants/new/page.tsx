import { createClient } from "@/lib/supabase/server";
import { clientsService } from "@/server/services/clients.service";
import { programsService } from "@/server/services/programs.service";
import { NewGrantProjectForm } from "./NewGrantProjectForm";

export default async function NewGrantProjectPage({
  searchParams,
}: {
  searchParams?: { client_id?: string };
}) {
  const supabase = await createClient();
  const [clients, programs] = await Promise.all([
    clientsService(supabase).list(),
    programsService(supabase).list(),
  ]);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Nouveau projet de subvention</h1>
      <NewGrantProjectForm
        clients={clients.map((c) => ({ id: c.id, label: c.name }))}
        programs={programs.map((p) => ({ id: p.id, label: p.name }))}
        defaultClientId={searchParams?.client_id}
      />
    </div>
  );
}
