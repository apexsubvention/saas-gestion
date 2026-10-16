"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Écran d'erreur du portail admin (Jade) : sans ce fichier, une action qui échoue (ex. un
// téléversement trop long ou trop lourd) affichait la page brute « Application error: a
// client-side exception has occurred ». Le menu et l'en-tête restent affichés ; seul le contenu
// est remplacé, avec un bouton pour réessayer.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <h2 className="font-semibold text-neutral-900">Une erreur est survenue</h2>
      <p className="max-w-md text-sm text-neutral-500">
        L&apos;action n&apos;a pas pu se terminer. Si tu téléversais un fichier : vérifie qu&apos;il fait moins de 4 Mo, puis réessaie — s&apos;il
        apparaît déjà dans la liste des documents, il a bien été enregistré (seule la lecture automatique a pu être interrompue).
      </p>
      {error.digest && <p className="text-xs text-neutral-400">Code : {error.digest}</p>}
      <button type="button" onClick={() => reset()} className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
        Réessayer
      </button>
    </div>
  );
}
