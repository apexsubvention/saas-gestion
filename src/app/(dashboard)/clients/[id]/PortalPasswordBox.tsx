"use client";

// Mot de passe du compte portail : conservé (pas affiché une seule fois), masqué par défaut avec
// bouton « Afficher » + « Copier », et « Régénérer » pour en émettre un nouveau à la demande
// (l'ancien cesse de fonctionner immédiatement) -- ex. le client l'a perdu, ou Jade veut le lui
// retransmettre plus tard.
import { useState, useTransition } from "react";
import { regeneratePortalPasswordAction } from "./actions";

export function PortalPasswordBox({ clientId, portalUserRowId, initialPassword }: { clientId: string; portalUserRowId: string; initialPassword: string | null }) {
  const [password, setPassword] = useState(initialPassword);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    if (!confirm("Générer un nouveau mot de passe ? L'ancien cessera de fonctionner immédiatement.")) return;
    setError(null);
    startTransition(async () => {
      const res = await regeneratePortalPasswordAction(clientId, portalUserRowId);
      if (res.error) {
        setError(res.error);
      } else {
        setPassword(res.newPassword);
        setRevealed(true);
      }
    });
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copie manuelle si l'API presse-papier est indisponible */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-neutral-500">Mot de passe :</span>
      <code className="rounded bg-neutral-100 px-2 py-1 font-mono text-neutral-800">
        {password ? (revealed ? password : "•".repeat(Math.min(password.length, 16))) : "—"}
      </code>
      <button type="button" onClick={() => setRevealed((v) => !v)} disabled={!password} className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
        {revealed ? "Masquer" : "Afficher"}
      </button>
      <button type="button" onClick={copy} disabled={!password} className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
        {copied ? "Copié ✓" : "Copier"}
      </button>
      <button type="button" onClick={regenerate} disabled={pending} className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
        {pending ? "…" : "Régénérer"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
