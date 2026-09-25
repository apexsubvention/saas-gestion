"use client";

// Jade : un dossier d'un client ENFANT qui ne concerne pas le client PARENT -- masqué
// seulement du portail du parent (le client enfant lui-même et le personnel voient toujours
// tout normalement). N'apparaît que si CE client a un client_parent_id (sinon rien à masquer).
import { useState, useTransition } from "react";
import { toggleHiddenFromParentPortalAction } from "./actions";

export function HideFromParentPortalToggle({ grantProjectId, initialHidden }: { grantProjectId: string; initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <input
        type="checkbox"
        checked={hidden}
        disabled={isPending}
        className="rounded border-neutral-300"
        onChange={(e) => {
          const next = e.target.checked;
          setHidden(next);
          setError(null);
          startTransition(async () => {
            const result = await toggleHiddenFromParentPortalAction(grantProjectId, next);
            if (result.error) {
              setHidden(!next);
              setError(result.error);
            }
          });
        }}
      />
      Masquer ce dossier du portail du client parent
      {error && <span className="text-red-600">({error})</span>}
    </label>
  );
}
