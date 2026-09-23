"use client";

// Recherche/filtre sur la liste de dossiers -- utile surtout pour un compte parent
// (ex. Sitegrow) qui voit aussi les dossiers de ses clients enfants. Purement côté
// affichage : filtre le tableau déjà chargé, aucune requête supplémentaire.
import { useMemo, useState } from "react";
import type { PortalDossier } from "@/server/services/portalDossiers.service";
import { DossierCard } from "./DossierCard";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function DossiersList({ dossiers, currentOrgUserId }: { dossiers: PortalDossier[]; currentOrgUserId: string | null }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return dossiers;
    return dossiers.filter((d) =>
      [d.name, d.clientName, d.programName].some((field) => field && normalize(field).includes(q))
    );
  }, [dossiers, query]);

  return (
    <div className="space-y-3">
      {dossiers.length > 1 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un dossier, un client ou un programme..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-sm"
        />
      )}
      {filtered.length > 0 ? (
        filtered.map((d) => <DossierCard key={d.id} dossier={d} currentOrgUserId={currentOrgUserId} />)
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
          {dossiers.length === 0
            ? "Aucun dossier pour l'instant — ton contact chez Apex n'a pas encore ajouté de dossier."
            : "Aucun dossier ne correspond à ta recherche."}
        </div>
      )}
    </div>
  );
}
