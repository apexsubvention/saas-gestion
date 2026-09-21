import type { DossierEventRow } from "@/server/services/audit";

const SOURCE_LABELS: Record<DossierEventRow["source"], { label: string; className: string }> = {
  manual: { label: "Manuel", className: "bg-slate-100 text-slate-600" },
  system: { label: "Apex", className: "bg-indigo-50 text-indigo-700" },
  ai: { label: "IA", className: "bg-violet-50 text-violet-700" },
  portal: { label: "Client", className: "bg-emerald-50 text-emerald-700" },
};

// Journal du dossier : chaque événement important est conservé (statut, entente, factures, documents,
// modifications manuelles...). Un événement n'est jamais réécrit.
export function DossierTimeline({ events }: { events: DossierEventRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">Journal du dossier</h2>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-400">
          Aucun événement pour l&apos;instant. Les changements de statut, l&apos;entente, les factures et les documents s&apos;y ajoutent automatiquement.
        </p>
      ) : (
        <ol className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
          {events.map((e) => {
            const src = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.system;
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                <time className="w-28 shrink-0 text-xs text-neutral-400" dateTime={e.occurred_at}>
                  {new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(e.occurred_at))}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="text-neutral-900">
                    {e.title} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${src.className}`}>{src.label}</span>
                  </p>
                  {e.detail && <p className="text-xs text-neutral-500">{e.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
