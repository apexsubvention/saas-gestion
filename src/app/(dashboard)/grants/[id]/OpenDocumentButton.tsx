"use client";

import { useState, useTransition } from "react";
import { getDocumentUrlAction } from "./actions";

// Génère une URL signée à la demande (bouton cliqué) plutôt qu'au rendu de la page :
// le bucket est privé et les URL signées expirent en quelques minutes, donc les
// générer à l'avance pour toute la liste de documents serait inutile (elles seraient
// souvent expirées au moment du clic) et plus coûteux (un appel storage par document
// affiché au lieu d'un seul, sur demande).
export function OpenDocumentButton({ storagePath, filename }: { storagePath: string; filename: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await getDocumentUrlAction(storagePath);
      if (result.error || !result.url) {
        setError(result.error ?? "Lien indisponible.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        title={filename}
      >
        {isPending ? "Ouverture..." : "Voir"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
