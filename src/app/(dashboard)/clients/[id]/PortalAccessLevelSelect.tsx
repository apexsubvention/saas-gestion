"use client";

// Niveau d'accès d'une personne au portail (0075) -- modifiable directement sur la fiche client.
import { useState, useTransition } from "react";
import { setPortalAccessLevelAction } from "./actions";
import { PORTAL_ACCESS_LEVELS, PORTAL_ACCESS_LEVEL_HINTS, PORTAL_ACCESS_LEVEL_LABELS, type PortalAccessLevel } from "@/lib/portal/accessLevels";

export function PortalAccessLevelSelect({ clientId, portalUserRowId, level }: { clientId: string; portalUserRowId: string; level: PortalAccessLevel }) {
  const [value, setValue] = useState<PortalAccessLevel>(level);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
      <label className="flex items-center gap-2">
        Accès :
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as PortalAccessLevel;
            const previous = value;
            setValue(next);
            setError(null);
            startTransition(async () => {
              const r = await setPortalAccessLevelAction(clientId, portalUserRowId, next);
              if (r.error) {
                setValue(previous);
                setError(r.error);
              }
            });
          }}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          {PORTAL_ACCESS_LEVELS.map((l) => (
            <option key={l} value={l}>{PORTAL_ACCESS_LEVEL_LABELS[l]}</option>
          ))}
        </select>
      </label>
      <span className="text-xs text-neutral-400">{PORTAL_ACCESS_LEVEL_HINTS[value]}</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
