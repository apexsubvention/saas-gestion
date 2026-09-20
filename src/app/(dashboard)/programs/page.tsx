import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programsService } from "@/server/services/programs.service";

const AVAILABILITY_LABELS: Record<string, string> = {
  open: "Ouvert",
  opening_soon: "Ouverture bientôt",
  continuous: "En continu",
  closed: "Fermé",
};

function money(n: number | null) {
  return n == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export default async function ProgramsPage() {
  const supabase = await createClient();
  const programs = await programsService(supabase).list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Programmes</h1>
        <Link href="/programs/new" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
          + Nouveau programme
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nom</th>
              <th className="px-4 py-2 font-medium">Organisme</th>
              <th className="px-4 py-2 font-medium">Territoire</th>
              <th className="px-4 py-2 font-medium">% remboursé</th>
              <th className="px-4 py-2 font-medium">Montant max.</th>
              <th className="px-4 py-2 font-medium">Date limite</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">Aucun programme pour l&apos;instant.</td></tr>
            )}
            {programs.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 font-medium text-neutral-900">
                  <Link href={`/programs/${p.id}`} className="hover:underline">{p.name}</Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">{p.agency ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{p.territory ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{p.typical_aid_rate == null ? "—" : `${Math.round(p.typical_aid_rate * 10000) / 100} %`}</td>
                <td className="px-4 py-2 text-neutral-600">{money(p.max_aid_amount)}</td>
                <td className="px-4 py-2 text-neutral-600">{p.deadline ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{AVAILABILITY_LABELS[p.availability_status] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
