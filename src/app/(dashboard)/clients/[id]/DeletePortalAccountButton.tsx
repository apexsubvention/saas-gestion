"use client";

// Supprime complètement le compte portail (différent de « Désactiver » : ici l'accès est révoqué
// immédiatement et le courriel redevient disponible pour un nouveau compte -- voir
// deletePortalAccountAction pour la suppression en cascade).
import { useState, useTransition } from "react";
import { deletePortalAccountAction } from "./actions";

export function DeletePortalAccountButton({ clientId, portalUserRowId, email }: { clientId: string; portalUserRowId: string; email: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    const label = email ? ` (${email})` : "";
    if (!confirm(`Supprimer complètement le compte portail${label} ? L'accès est révoqué immédiatement et le courriel redevient disponible pour un nouveau compte. Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deletePortalAccountAction(clientId, portalUserRowId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={remove} disabled={pending} className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50">
        {pending ? "Suppression…" : "Supprimer le compte"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
