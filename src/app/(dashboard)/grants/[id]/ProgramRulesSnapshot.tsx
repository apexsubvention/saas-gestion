import { diffSnapshot } from "@/features/grants/programSnapshot";
import type { ProgramRow } from "@/server/repositories/programs.repository";
import type { SnapshotRow } from "@/server/services/programSnapshot.service";
import { takeSnapshotAction } from "./snapshotActions";

// Règles du programme figées pour CE dossier : elles ne changent jamais, même si le programme évolue.
export function ProgramRulesSnapshot({ grantProjectId, program, snapshots }: { grantProjectId: string; program: ProgramRow | null; snapshots: SnapshotRow[] }) {
  const latest = snapshots[0] ?? null;
  const changes = latest && program ? diffSnapshot(latest.snapshot, program) : [];
  const dateOf = (iso: string) => new Intl.DateTimeFormat("fr-CA", { dateStyle: "long" }).format(new Date(iso));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Règles du programme figées pour ce dossier</h2>
        <form action={takeSnapshotAction.bind(null, grantProjectId)}>
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Figer les règles actuelles</button>
        </form>
      </div>
      {!latest ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-4 text-sm text-neutral-500">
          Aucune copie des règles n&apos;a été gardée pour ce dossier. Clique sur « Figer les règles actuelles » pour conserver les taux, dépenses admissibles, dates et guides connus aujourd&apos;hui : ils resteront liés à ce dossier même si le programme change.
        </p>
      ) : (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-neutral-700">
            Dernière copie : <strong>{dateOf(latest.taken_at)}</strong> ({latest.reason === "creation" ? "à la création du dossier" : "à ta demande"}) — {snapshots.length} copie{snapshots.length > 1 ? "s" : ""} conservée{snapshots.length > 1 ? "s" : ""}, jamais modifiée{snapshots.length > 1 ? "s" : ""}.
            Programme : {latest.snapshot.name}
            {latest.snapshot.typical_aid_rate != null ? ` · ${Math.round(Number(latest.snapshot.typical_aid_rate) * 10000) / 100} % remboursé` : ""}
            {latest.snapshot.max_aid_amount != null ? ` · max. ${new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(latest.snapshot.max_aid_amount))}` : ""}
            {latest.snapshot.deadline ? ` · date limite ${latest.snapshot.deadline}` : ""}.
          </p>
          {changes.length === 0 ? (
            <p className="text-xs text-emerald-700">Le programme n&apos;a pas changé depuis cette copie.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-800">Le programme a changé depuis cette copie ({changes.length} règle{changes.length > 1 ? "s" : ""}) — ce dossier reste lié aux valeurs d&apos;origine :</p>
              <ul className="space-y-1.5">
                {changes.map((c) => (
                  <li key={c.label} className="rounded-md bg-amber-50/60 px-3 py-2 text-xs">
                    <span className="font-medium text-neutral-800">{c.label}</span>
                    <span className="block text-neutral-500">Au dossier : {c.before}</span>
                    <span className="block text-neutral-500">Aujourd&apos;hui : {c.after}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
