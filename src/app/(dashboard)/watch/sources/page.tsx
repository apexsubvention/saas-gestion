import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleDashed, DatabaseZap, ExternalLink, Plus, Power } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { SOURCE_FAMILY_LABELS, SOURCE_HEALTH_LABELS } from "@/features/watch/constants";

function formatDateTime(value: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function FundingSourcesPage() {
  await requireOrgContext();
  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from("funding_sources")
    .select("*")
    .order("active", { ascending: false })
    .order("priority", { ascending: true })
    .order("name");

  if (error) throw error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link href="/watch" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Retour à la veille</Link>
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-600"><DatabaseZap className="h-4 w-4" /> Couverture de veille</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Sources surveillées</h1>
          <p className="mt-1 text-sm text-slate-500">Registre des sources qu'Apex pourra vérifier. Aucun statut de collecte n'est inventé : une source reste « Jamais vérifiée » tant qu'aucun connecteur ne l'a réellement contrôlée.</p>
        </div>
        <Link href="/watch/sources/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Ajouter une source</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Sources enregistrées" value={String((sources ?? []).length)} />
        <Metric label="Sources officielles" value={String((sources ?? []).filter((source) => source.is_official).length)} />
        <Metric label="Sources actives" value={String((sources ?? []).filter((source) => source.active).length)} />
      </div>

      {(sources ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <DatabaseZap className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-900">Aucune source enregistrée</h2>
          <p className="mt-1 text-sm text-slate-500">Commence par Business Benefits Finder, Québec.ca ou toute autre source que tu veux inclure dans la couverture Apex.</p>
          <Link href="/watch/sources/new" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">Ajouter une source</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Source</th><th className="px-5 py-3">Famille</th><th className="px-5 py-3">Couverture</th><th className="px-5 py-3">Collecte</th><th className="px-5 py-3">État réel</th><th className="px-5 py-3">Dernière vérif.</th><th className="px-5 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sources ?? []).map((source) => (
                  <tr key={source.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><StatusIcon status={source.health_status} active={source.active} /><div><div className="font-medium text-slate-900">{source.name}</div><div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{source.is_official ? <span className="font-medium text-emerald-700">Officielle</span> : <span>Secondaire</span>} · priorité {source.priority}</div></div></div></td>
                    <td className="px-5 py-4 text-slate-600">{SOURCE_FAMILY_LABELS[source.source_family] ?? source.source_family}</td>
                    <td className="px-5 py-4 text-slate-600">{source.territory_label ?? source.geographic_level}</td>
                    <td className="px-5 py-4"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{source.collection_method}</span></td>
                    <td className="px-5 py-4 text-slate-600">{source.active ? SOURCE_HEALTH_LABELS[source.health_status] ?? source.health_status : "Désactivée"}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(source.last_checked_at)}</td>
                    <td className="px-5 py-4 text-right"><a href={source.base_url} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ExternalLink className="h-4 w-4" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div></div>; }
function StatusIcon({ status, active }: { status: string; active: boolean }) {
  if (!active) return <Power className="h-4 w-4 text-slate-400" />;
  if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warning" || status === "error") return <CircleAlert className="h-4 w-4 text-amber-600" />;
  return <CircleDashed className="h-4 w-4 text-slate-400" />;
}
