import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { subsidyDepositsService } from "@/server/services/subsidyDeposits.service";
import { DepositForm } from "./DepositForm";
import { DepositsTable } from "./DepositsTable";

// Onglet « Dépôts » du portail (0079, Jade) : comptabilité des dépôts reçus -- chaque dépôt avec
// sa date, son montant, sa provenance, sa référence et sa preuve (chèque, avis de virement PDF...),
// facile à suivre (et à exporter) pour une comptable.
export default async function PortalDepositsPage() {
  const supabase = await createClient();
  const [deposits, { data: projectRows }] = await Promise.all([
    subsidyDepositsService(supabase as unknown as SupabaseClient).list(),
    supabase.from("grant_projects").select("id, name, clients(name)").order("name"),
  ]);
  const dossiers = ((projectRows ?? []) as unknown as Array<{ id: string; name: string; clients: { name: string } | null }>).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.clients?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Dépôts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Inscris ici chaque dépôt reçu (subvention, remboursement...) avec sa preuve : un chèque, un avis de virement PDF, une
          capture du relevé. Tout est regroupé au même endroit pour ta comptabilité.
        </p>
      </div>
      {deposits == null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          L&apos;onglet Dépôts n&apos;est pas encore activé. Ton équipe chez Apex doit terminer son installation.
        </div>
      ) : (
        <>
          <DepositForm dossiers={dossiers} />
          <DepositsTable deposits={deposits} />
        </>
      )}
    </div>
  );
}
