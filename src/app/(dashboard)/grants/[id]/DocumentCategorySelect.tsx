"use client";

// Jade : corriger la catégorie d'un document après coup (ex. téléversé comme "Convention" par
// erreur, en fait une "Facture") -- même principe que HideFromParentPortalToggle (changement
// immédiat au onChange, retour en arrière si l'action échoue).
import { useState, useTransition } from "react";
import { DOCUMENT_CATEGORY_OPTIONS } from "@/features/grants/constants";
import { updateDocumentCategoryAction } from "./actions";

export function DocumentCategorySelect({
  grantProjectId,
  documentId,
  initialCategory,
}: {
  grantProjectId: string;
  documentId: string;
  initialCategory: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={category}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = category;
          setCategory(next);
          setError(null);
          startTransition(async () => {
            const result = await updateDocumentCategoryAction(grantProjectId, documentId, next);
            if (result.error) {
              setCategory(prev);
              setError(result.error);
            }
          });
        }}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 disabled:opacity-50"
      >
        {DOCUMENT_CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
