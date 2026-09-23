"use client";

// Bibliothèque de documents du portail (0045) -- recherche/filtre côté client, même
// principe que DossiersList.tsx : aucune requête supplémentaire, on filtre le tableau
// déjà chargé.
import { useMemo, useState } from "react";
import type { PortalDocumentGroup } from "@/server/services/portalDocuments.service";
import { PortalOpenDocumentButton } from "./PortalOpenDocumentButton";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Déposé par Apex",
  email: "Reçu par courriel",
  meeting: "Réunion",
  client_portal: "Déposé par vous",
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA");
}

export function DocumentsLibrary({ groups }: { groups: PortalDocumentGroup[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        documents: g.documents.filter(
          (d) =>
            normalize(d.filename).includes(q) ||
            normalize(d.categoryLabel).includes(q) ||
            (g.grantProjectName && normalize(g.grantProjectName).includes(q)) ||
            (g.clientName && normalize(g.clientName).includes(q))
        ),
      }))
      .filter((g) => g.documents.length > 0);
  }, [groups, query]);

  const totalCount = groups.reduce((sum, g) => sum + g.documents.length, 0);

  return (
    <div className="space-y-4">
      {totalCount > 5 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un document, une catégorie ou un dossier..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-sm"
        />
      )}

      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((g) => (
            <div key={g.grantProjectId ?? `client:${g.clientName}`} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2">
                <p className="text-sm font-medium text-neutral-900">{g.grantProjectName ?? "Documents généraux"}</p>
                {g.clientName && g.grantProjectName && <p className="text-xs text-neutral-500">{g.clientName}</p>}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {g.documents.map((d) => (
                    <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2 text-neutral-900">{d.filename}</td>
                      <td className="px-4 py-2 text-neutral-600">{d.categoryLabel}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{SOURCE_LABELS[d.source] ?? d.source}</td>
                      <td className="px-4 py-2 text-neutral-400">{formatDate(d.createdAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <PortalOpenDocumentButton documentId={d.id} filename={d.filename} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
          {totalCount === 0 ? "Aucun document pour l'instant." : "Aucun document ne correspond à ta recherche."}
        </div>
      )}
    </div>
  );
}
