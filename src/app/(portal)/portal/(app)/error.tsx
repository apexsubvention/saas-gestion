"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Limite les erreurs d'une page du portail (ex. /portal/veille) à SA zone de contenu -- sans ce
// fichier, Next.js remonte l'erreur jusqu'à ce qu'il trouve un error.tsx, ce qui peut faire
// disparaître le menu latéral/en-tête (rendus dans (app)/layout.tsx, juste au-dessus) plutôt que de
// juste montrer un message dans la zone de contenu. Le layout, lui, reste monté.
export default function PortalContentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[portail]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <h2 className="font-semibold text-slate-900">Une erreur est survenue</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Cette section n&apos;a pas pu s&apos;afficher. Réessaie, ou reviens plus tard -- Apex a été avisé.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
      >
        Réessayer
      </button>
    </div>
  );
}
