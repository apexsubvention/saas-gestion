"use client";

// Jade (0064) : certaines subventions ne demandent jamais de preuve de paiement des factures
// fournisseurs -- décoche ici pour que le portail client n'affiche plus ce bloc. Le personnel
// garde toujours la possibilité d'en joindre une côté interne (SuppliersTable.tsx) ; ce réglage
// ne contrôle que ce qui est demandé au client. Même idiome que HideFromParentPortalToggle
// (changement immédiat, retour en arrière si l'action échoue).
import { useState, useTransition } from "react";
import { toggleRequiresPaymentProofAction } from "./actions";

export function RequiresPaymentProofToggle({ grantProjectId, initialRequired }: { grantProjectId: string; initialRequired: boolean }) {
  const [required, setRequired] = useState(initialRequired);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <input
        type="checkbox"
        checked={required}
        disabled={isPending}
        className="rounded border-neutral-300"
        onChange={(e) => {
          const next = e.target.checked;
          setRequired(next);
          setError(null);
          startTransition(async () => {
            const result = await toggleRequiresPaymentProofAction(grantProjectId, next);
            if (result.error) {
              setRequired(!next);
              setError(result.error);
            }
          });
        }}
      />
      Preuve de paiement requise (visible du portail client)
      {error && <span className="text-red-600">({error})</span>}
    </label>
  );
}
