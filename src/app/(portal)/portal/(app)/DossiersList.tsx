"use client";

// Recherche/filtre/tri sur la liste de dossiers -- purement côté affichage : filtre et
// trie le tableau déjà chargé, aucune requête supplémentaire.
//
// Jade a demandé deux améliorations pour un compte parent (ex. Sitegrow, qui voit aussi
// les dossiers de ses clients enfants via la hiérarchie -- cf. 0028) :
//  1. Deux colonnes : ses propres dossiers (client_id = celui du compte portail) à
//     gauche, les dossiers de ses clients à droite -- plutôt qu'une seule liste mélangée.
//     Un compte sans client enfant (le cas courant) ne voit qu'une colonne, comme avant.
//  2. Un ordre de priorité par défaut (pas juste alphabétique) : un dossier avec une
//     réclamation encore active passe avant, puis par échéance de réclamation la plus
//     proche -- voir dossierPriority.ts. Appliqué aux deux colonnes séparément.
//
// 0062 : « Tâches discutées / commentaires » (ClientNotes) n'est pas lié à un dossier précis
// -- un fil PAR CLIENT. La colonne "Tes dossiers" n'a qu'un seul client (ownClientId), donc un
// seul fil en haut de la colonne. La colonne "Dossiers de tes clients" peut couvrir PLUSIEURS
// clients enfants différents -- elle est donc regroupée par client (au lieu d'une liste plate),
// chaque groupe affichant son propre fil de notes suivi de ses dossiers.
import { useMemo, useState } from "react";
import type { PortalDossier } from "@/server/services/portalDossiers.service";
import type { ClientNoteView } from "@/server/services/clientNotes.service";
import { GRANT_PROJECT_STATUS_OPTIONS } from "@/features/grants/constants";
import { DossierCard } from "./DossierCard";
import { ClientNotes } from "./ClientNotes";
import { compareDossiersByPriority } from "./dossierPriority";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Regroupe une liste (déjà triée par priorité) de dossiers par client, en conservant l'ordre
// d'apparition -- un compte peut avoir plusieurs clients enfants distincts dans "Dossiers de
// tes clients".
function groupByClient(dossiers: PortalDossier[]): Array<{ clientId: string; clientName: string | null; dossiers: PortalDossier[] }> {
  const order: string[] = [];
  const groups = new Map<string, { clientId: string; clientName: string | null; dossiers: PortalDossier[] }>();
  for (const d of dossiers) {
    if (!groups.has(d.clientId)) {
      order.push(d.clientId);
      groups.set(d.clientId, { clientId: d.clientId, clientName: d.clientName, dossiers: [] });
    }
    groups.get(d.clientId)!.dossiers.push(d);
  }
  return order.map((id) => groups.get(id)!);
}

function DossierColumn({
  title,
  dossiers,
  currentOrgUserId,
  emptyLabel,
  ownClientId,
  notesByClient,
}: {
  title: string | null;
  dossiers: PortalDossier[];
  currentOrgUserId: string | null;
  emptyLabel: string;
  // Colonne "Tes dossiers" (un seul client, notes affichées une fois en haut) : passe
  // ownClientId. Colonne "Dossiers de tes clients" (plusieurs clients possibles, notes par
  // groupe) : laisse à null -- voir groupByClient ci-dessus.
  ownClientId?: string;
  notesByClient: Record<string, ClientNoteView[]>;
}) {
  const groups = ownClientId ? null : groupByClient(dossiers);
  const dossierList =
    dossiers.length === 0 ? (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
        {emptyLabel}
      </div>
    ) : (
      // Vignettes en grille plutôt qu'une liste empilée (0062, Jade : « plus visuel ») -- possible
      // maintenant que le détail s'ouvre en pop-up plutôt qu'en dépliant la carte sur place.
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {dossiers.map((d) => (
          <DossierCard key={d.id} dossier={d} currentOrgUserId={currentOrgUserId} />
        ))}
      </div>
    );
  return (
    <div className="space-y-3">
      {title && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {title} <span className="font-normal text-neutral-400">({dossiers.length})</span>
        </h2>
      )}
      {ownClientId ? (
        // Les tâches discutées ne sont pas liées à un dossier -- toujours affichées, même sans
        // aucun dossier (nouveau client) ou si la recherche ne trouve rien.
        <div className="space-y-3">
          <ClientNotes clientId={ownClientId} notes={notesByClient[ownClientId] ?? []} currentOrgUserId={currentOrgUserId} />
          {dossierList}
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.clientId} className="space-y-3">
              <ClientNotes
                clientId={g.clientId}
                clientLabel={g.clientName ?? undefined}
                notes={notesByClient[g.clientId] ?? []}
                currentOrgUserId={currentOrgUserId}
              />
              {g.dossiers.map((d) => (
                <DossierCard key={d.id} dossier={d} currentOrgUserId={currentOrgUserId} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        dossierList
      )}
    </div>
  );
}

export function DossiersList({
  dossiers,
  ownClientId,
  currentOrgUserId,
  notesByClient,
}: {
  dossiers: PortalDossier[];
  ownClientId: string;
  currentOrgUserId: string | null;
  notesByClient: Record<string, ClientNoteView[]>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const statusesPresent = useMemo(() => new Set(dossiers.map((d) => d.status)), [dossiers]);
  const statusOptions = GRANT_PROJECT_STATUS_OPTIONS.filter((opt) => statusesPresent.has(opt.value));

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return dossiers
      .filter((d) => !q || [d.name, d.clientName, d.programName].some((field) => field && normalize(field).includes(q)))
      .filter((d) => !status || d.status === status)
      .sort(compareDossiersByPriority);
  }, [dossiers, query, status]);

  const own = filtered.filter((d) => d.clientId === ownClientId);
  const forClients = filtered.filter((d) => d.clientId !== ownClientId);
  const hasChildClientDossiers = dossiers.some((d) => d.clientId !== ownClientId);

  return (
    <div className="space-y-4">
      {dossiers.length > 1 && (
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un dossier, un client ou un programme..."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-xs"
          />
          {statusOptions.length > 1 && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
            >
              <option value="">Tous les statuts</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {hasChildClientDossiers ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DossierColumn
            title="Tes dossiers"
            dossiers={own}
            currentOrgUserId={currentOrgUserId}
            emptyLabel="Aucun dossier à toi ne correspond à ta recherche."
            ownClientId={ownClientId}
            notesByClient={notesByClient}
          />
          <DossierColumn
            title="Dossiers de tes clients"
            dossiers={forClients}
            currentOrgUserId={currentOrgUserId}
            emptyLabel="Aucun dossier de tes clients ne correspond à ta recherche."
            notesByClient={notesByClient}
          />
        </div>
      ) : (
        // Un seul client concerné (le tien) -- les tâches discutées restent toujours affichées,
        // même si aucun dossier n'existe encore ou si la recherche ne trouve rien.
        <DossierColumn
          title={null}
          dossiers={filtered}
          currentOrgUserId={currentOrgUserId}
          emptyLabel={
            dossiers.length === 0
              ? "Aucun dossier pour l'instant — ton contact chez Apex n'a pas encore ajouté de dossier."
              : "Aucun dossier ne correspond à ta recherche."
          }
          ownClientId={ownClientId}
          notesByClient={notesByClient}
        />
      )}
    </div>
  );
}
