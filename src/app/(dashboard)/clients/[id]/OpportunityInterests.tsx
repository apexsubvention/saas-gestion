"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { ClientOpportunityInterestRow, OpportunityInterestStatus } from "@/server/repositories/clientOpportunityInterests.repository";
import { updateOpportunityInterestStatusAction } from "./actions";

const STATUS_OPTIONS: { value: OpportunityInterestStatus; label: string }[] = [
  { value: "new", label: "Nouveau" },
  { value: "viewed", label: "Vu" },
  { value: "contacted", label: "Contacté" },
  { value: "dismissed", label: "Classé" },
];

const STATUS_BADGE: Record<OpportunityInterestStatus, string> = {
  new: "bg-indigo-50 text-indigo-700",
  viewed: "bg-slate-100 text-slate-600",
  contacted: "bg-emerald-50 text-emerald-700",
  dismissed: "bg-neutral-100 text-neutral-400",
};

// Le client a signalé son intérêt pour une opportunité de la veille depuis son portail (0052) --
// affiché ici pour que Jade le voie sans dépendre uniquement de la notification (qui peut être
// marquée lue et disparaître de l'inbox). Seul le statut est modifiable ici ; la ligne elle-même
// vient toujours du portail.
export function OpportunityInterests({ clientId, interests }: { clientId: string; interests: ClientOpportunityInterestRow[] }) {
  const [isPending, startTransition] = useTransition();

  if (interests.length === 0) {
    return <p className="px-4 py-6 text-sm text-neutral-400">Aucune opportunité signalée par ce client pour l&apos;instant.</p>;
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {interests.map((interest) => (
        <li key={interest.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href={`/watch/${interest.opportunity_id}`} className="text-sm font-medium text-neutral-900 hover:underline">
              {interest.funding_opportunities?.title ?? "Opportunité"}
            </Link>
            {interest.note && <p className="mt-1 text-sm text-neutral-600">« {interest.note} »</p>}
            <p className="mt-1 text-xs text-neutral-400">{new Date(interest.created_at).toLocaleDateString("fr-CA")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[interest.status]}`}>
              {STATUS_OPTIONS.find((o) => o.value === interest.status)?.label ?? interest.status}
            </span>
            <select
              defaultValue={interest.status}
              disabled={isPending}
              onChange={(e) => {
                const status = e.target.value as OpportunityInterestStatus;
                startTransition(() => {
                  void updateOpportunityInterestStatusAction(clientId, interest.id, status);
                });
              }}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  );
}
