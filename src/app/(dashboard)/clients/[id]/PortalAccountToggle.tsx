"use client";

import { useTransition } from "react";
import { setPortalAccountActiveAction } from "./actions";

export function PortalAccountToggle({
  clientId,
  portalUserRowId,
  active,
}: {
  clientId: string;
  portalUserRowId: string;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => setPortalAccountActiveAction(clientId, portalUserRowId, !active))}
      className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
    >
      {isPending ? "..." : active ? "Désactiver l'accès" : "Réactiver l'accès"}
    </button>
  );
}
