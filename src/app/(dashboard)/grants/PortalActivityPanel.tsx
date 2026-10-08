"use client";

// Résumé de l'activité des clients dans le portail (0076, Jade) -- en haut de l'onglet Dossiers :
// qui a déposé quoi, pour quel dossier (« Sitegrow a déposé une facture pour le versement 1 de son
// client enfant Caracol »), pour savoir tout de suite quoi traiter. « Traité » retire la ligne de
// la liste « À traiter » (réversible dans « Tout voir »).
import Link from "next/link";
import { useState, useTransition } from "react";
import type { PortalActivityItem } from "@/server/services/portalActivity.service";
import { setPortalActivityHandledAction } from "./portalActivityActions";

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  if (days <= 0 && new Date().toDateString() === d.toDateString()) return `Aujourd'hui, ${time}`;
  if (days <= 1) return `Hier, ${time}`;
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

export function PortalActivityPanel({ items }: { items: PortalActivityItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // traités à l'instant (avant le rafraîchissement)
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toHandle = items.filter((i) => !i.handledAt && !hidden.has(i.key));
  const visible = showAll ? items : toHandle;

  function setHandled(keys: string[], handled: boolean) {
    setError(null);
    if (handled) setHidden((prev) => new Set([...prev, ...keys]));
    startTransition(async () => {
      const r = await setPortalActivityHandledAction(keys, handled);
      if (r.error) {
        setError(r.error);
        setHidden((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Activité des clients dans le portail
            {toHandle.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{toHandle.length} à traiter</span>
            )}
          </h2>
          <p className="text-xs text-neutral-500">Fichiers déposés, tâches faites, paiements et notes des 60 derniers jours.</p>
        </div>
        <div className="flex items-center gap-2">
          {!showAll && toHandle.length > 1 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setHandled(toHandle.map((i) => i.key), true)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Tout marquer traité
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {showAll ? "Seulement à traiter" : "Tout voir"}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-400">
          {showAll ? "Aucune activité des clients dans le portail ces 60 derniers jours." : "Rien à traiter — tout est à jour ✓"}
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
          {visible.map((i) => {
            const isHandled = !!i.handledAt || hidden.has(i.key);
            return (
              <li key={i.key} className={`flex items-start gap-3 px-4 py-2.5 ${isHandled ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isHandled ? "bg-neutral-300" : "bg-amber-400"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-800">{i.sentence}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {when(i.occurredAt)}
                    {i.grantProjectId && (
                      <>
                        {" · "}
                        <Link href={`/grants/${i.grantProjectId}`} className="text-blue-600 hover:underline">
                          {i.dossierName ?? "Ouvrir le dossier"}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setHandled([i.key], !isHandled)}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {isHandled ? "Remettre à traiter" : "Traité ✓"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
    </section>
  );
}
