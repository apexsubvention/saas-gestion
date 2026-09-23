"use client";

// Équivalent portail de OpenDocumentButton.tsx (grants/[id]) : URL signée générée à la
// demande plutôt qu'au rendu de la page (bucket privé, URL signées de courte durée).
import { useState, useTransition } from "react";
import { getPortalDocumentUrlAction } from "./actions";

export function PortalOpenDocumentButton({ documentId, filename }: { documentId: string; filename: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await getPortalDocumentUrlAction(documentId);
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
