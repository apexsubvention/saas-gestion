"use client";

// Onglets de la fiche client -- pur affichage : chaque panneau (overview/dossiers/
// documents) est déjà entièrement rendu côté serveur dans page.tsx (certains, comme
// CompatiblePrograms, sont des Server Components async qui font leurs propres requêtes)
// et transmis ici tel quel ; ce composant ne fait qu'en choisir un à afficher. Rien n'est
// supprimé ni re-fetché en changeant d'onglet -- juste une autre disposition de ce qui
// existait déjà comme sections empilées. Même pattern que ScheduleTabs (échéancier).
import { useState, type ReactNode } from "react";

type Tab = "overview" | "dossiers" | "documents";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Aperçu" },
  { id: "dossiers", label: "Dossiers" },
  { id: "documents", label: "Documents" },
];

export function ClientTabs({
  overview,
  dossiers,
  documents,
}: {
  overview: ReactNode;
  dossiers: ReactNode;
  documents: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === "overview" ? "space-y-6" : "hidden"}>{overview}</div>
      <div className={tab === "dossiers" ? "space-y-6" : "hidden"}>{dossiers}</div>
      <div className={tab === "documents" ? "space-y-6" : "hidden"}>{documents}</div>
    </div>
  );
}
