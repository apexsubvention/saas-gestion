"use client";

// Recherche/filtre sur la liste de dossiers -- purement côté affichage : filtre le tableau déjà
// chargé, aucune requête supplémentaire.
//
// Jade a demandé deux améliorations pour un compte parent (ex. Sitegrow, qui voit aussi
// les dossiers de ses clients enfants via la hiérarchie -- cf. 0028) :
//  1. Deux colonnes : ses propres dossiers (client_id = celui du compte portail) à
//     gauche, les dossiers de ses clients à droite -- plutôt qu'une seule liste mélangée.
//     Un compte sans client enfant (le cas courant) ne voit qu'une colonne, comme avant.
//  2. Un ordre de priorité par défaut -- géré par la répartition en colonnes de STATUT
//     ci-dessous plutôt que par tri chronologique.
//
// 0063 (Jade, suite à 0062) : la grille de vignettes condensée ne lui plaisait pas -- remplacée
// par un vrai tableau façon Trello, un statut de dossier = une colonne, les cartes empilées
// verticalement (plus grandes, plus lisibles) plutôt qu'une grille compacte. La scission
// Tes dossiers / Dossiers de tes clients ci-dessus est CONSERVÉE (Jade) -- pas de scission
// supplémentaire par client enfant à l'intérieur de "Dossiers de tes clients" : le nom du client
// reste visible sur chaque carte (DossierCard.tsx). Statut "rejected" absent : un dossier refusé
// est déjà retiré du portail plus haut (portalDossiers.service.ts, HIDDEN_PROJECT_STATUSES).
//
// 0064 (Jade, suite à 0063) : les deux tableaux empilés l'un sous l'autre rendaient les 5
// colonnes de statut difficiles à voir toutes en même temps -- remplacés par un DUO D'ONGLETS
// (« Tes dossiers » / « Dossiers de tes clients ») : un seul tableau affiché à la fois, ses 5
// colonnes visibles ensemble sans avoir à défiler passé l'autre. Onglets absents quand il n'y a
// qu'un seul côté (compte sans client enfant, le cas courant) -- comme avant.
//
// « Tâches discutées / commentaires » (ClientNotes, 0062) est retirée de cet affichage à la
// demande de Jade -- le code (service, actions, composant) reste en place pour une réactivation
// éventuelle, seul l'appel depuis ce fichier a été enlevé.
import { useMemo, useState } from "react";
import type { PortalDossier } from "@/server/services/portalDossiers.service";
import { GRANT_PROJECT_STATUS_LABELS, grantProjectStatusBadgeClass } from "@/features/grants/constants";
import { DossierCard } from "./DossierCard";
import { compareDossiersByPriority } from "./dossierPriority";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Approuvé — en attente de réclamation en premier (0064, Jade : « c'est là qu'ils vont en avoir
// le plus »), avant même "À rédiger" qui ouvrait la liste jusqu'ici.
const STATUS_COLUMNS = ["awaiting_claim", "draft", "pending_approval", "approved", "completed"] as const;

function StatusBoard({ dossiers, currentOrgUserId }: { dossiers: PortalDossier[]; currentOrgUserId: string | null }) {
  const columns = new Map<string, PortalDossier[]>();
  for (const status of STATUS_COLUMNS) columns.set(status, []);
  for (const d of dossiers) columns.get(d.status)?.push(d);
  // Dans chaque colonne, le dossier le plus urgent (réclamation en attente, échéance la plus
  // proche) en premier -- même logique de priorité que l'ancienne vue liste unique
  // (dossierPriority.ts), maintenant appliquée à l'intérieur de chaque colonne de statut plutôt
  // qu'à toute la liste (le statut lui-même fait déjà l'essentiel du tri entre colonnes).
  for (const items of columns.values()) items.sort(compareDossiersByPriority);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STATUS_COLUMNS.map((status) => {
        const items = columns.get(status) ?? [];
        return (
          <div key={status} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${grantProjectStatusBadgeClass(status)}`}>
                {GRANT_PROJECT_STATUS_LABELS[status] ?? status}
              </span>
              <span className="text-xs text-neutral-400">({items.length})</span>
            </div>
            <div className="flex flex-col gap-3">
              {items.map((d) => (
                <DossierCard key={d.id} dossier={d} currentOrgUserId={currentOrgUserId} />
              ))}
              {items.length === 0 && (
                <p className="rounded border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-300">Aucun dossier</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DossiersList({
  dossiers,
  ownClientId,
  currentOrgUserId,
}: {
  dossiers: PortalDossier[];
  ownClientId: string;
  currentOrgUserId: string | null;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return dossiers;
    return dossiers.filter((d) => [d.name, d.clientName, d.programName].some((field) => field && normalize(field).includes(q)));
  }, [dossiers, query]);

  const own = filtered.filter((d) => d.clientId === ownClientId);
  const forClients = filtered.filter((d) => d.clientId !== ownClientId);
  const hasChildClientDossiers = dossiers.some((d) => d.clientId !== ownClientId);
  // Onglet actif (0064) -- "Tes dossiers" par défaut ; sans objet quand hasChildClientDossiers
  // est faux (un seul tableau, pas d'onglets).
  const [activeTab, setActiveTab] = useState<"own" | "clients">("own");

  if (dossiers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
        Aucun dossier pour l&apos;instant — ton contact chez Apex n&apos;a pas encore ajouté de dossier.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dossiers.length > 1 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un dossier, un client ou un programme..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-xs"
        />
      )}

      {hasChildClientDossiers ? (
        <div className="space-y-4">
          {/* Bascule très visible entre les deux tableaux (0064, Jade : « c'est pas assez en
              évidence... j'aimerais qu'on voit qu'il y en a deux qui existent ») -- un vrai
              interrupteur à deux positions (fond, ombre sur l'onglet actif) plutôt que de
              simples onglets discrets soulignés. */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-500">Affichage</p>
            <div className="inline-flex rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("own")}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "own" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                Tes dossiers <span className="font-normal">({own.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("clients")}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "clients" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                Dossiers de tes clients <span className="font-normal">({forClients.length})</span>
              </button>
            </div>
          </div>

          {activeTab === "own" ? (
            own.length > 0 ? (
              <StatusBoard dossiers={own} currentOrgUserId={currentOrgUserId} />
            ) : (
              <p className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
                Aucun dossier à toi ne correspond à ta recherche.
              </p>
            )
          ) : forClients.length > 0 ? (
            <StatusBoard dossiers={forClients} currentOrgUserId={currentOrgUserId} />
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
              Aucun dossier de tes clients ne correspond à ta recherche.
            </p>
          )}
        </div>
      ) : filtered.length > 0 ? (
        <StatusBoard dossiers={filtered} currentOrgUserId={currentOrgUserId} />
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
          Aucun dossier ne correspond à ta recherche.
        </p>
      )}
    </div>
  );
}
