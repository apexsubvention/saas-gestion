"use client";

// Équivalent portail de OpenDocumentButton.tsx (grants/[id]) : URL signée générée à la
// demande plutôt qu'au rendu de la page (bucket privé, URL signées de courte durée).
import { useState, useTransition } from "react";
import { getPortalDocumentUrlAction } from "./actions";

export function PortalOpenDocumentButton({
  documentId,
  filename,
  label,
  className,
}: {
  documentId: string;
  filename: string;
  // Texte du bouton -- "Voir" par défaut ; ex. "Voir la convention" (0063) pour préciser de quoi
  // il s'agit quand le bouton n'est pas juste à côté du nom du fichier.
  label?: string;
  // Style du lien -- bleu par défaut (comme partout ailleurs) ; ex. vert pour la convention
  // (0063, Jade : « écrit en vert »), en évidence par rapport aux autres liens du portail.
  className?: string;
}) {
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
        className={className ?? "text-sm text-blue-600 hover:underline disabled:opacity-50"}
        title={filename}
      >
        {isPending ? "Ouverture..." : (label ?? "Voir")}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
