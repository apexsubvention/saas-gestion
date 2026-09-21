// Associe le nom lu sur une facture à un fournisseur déjà présent dans le tableau du dossier.
// Prudent : mieux vaut créer une nouvelle ligne (facile à supprimer/fusionner) qu'attribuer une
// facture au mauvais fournisseur.
import { normalizeSearchText } from "@/features/watch/search";

const LEGAL_SUFFIXES = new Set(["inc", "incorporee", "ltee", "ltd", "limitee", "limited", "enr", "senc", "sencrl", "corp", "corporation", "llc", "cie", "co", "sa", "srl"]);

function tokens(name: string): string[] {
  return normalizeSearchText(name)
    .split(" ")
    .filter((t) => t && !LEGAL_SUFFIXES.has(t));
}

export function matchSupplier<T extends { id: string; name: string }>(invoiceName: string, suppliers: T[]): T | null {
  const wanted = tokens(invoiceName);
  if (wanted.length === 0) return null;
  const wantedKey = wanted.join(" ");

  let best: { supplier: T; score: number } | null = null;
  for (const supplier of suppliers) {
    const cand = tokens(supplier.name);
    if (cand.length === 0) continue;
    const candKey = cand.join(" ");
    let score = 0;
    if (candKey === wantedKey) score = 1;
    else if (Math.min(candKey.length, wantedKey.length) >= 4 && (candKey.includes(wantedKey) || wantedKey.includes(candKey))) score = 0.85;
    else {
      const shared = wanted.filter((t) => t.length >= 4 && cand.includes(t)).length;
      const overlap = shared / Math.min(wanted.length, cand.length);
      if (shared >= 1 && overlap >= 0.6) score = 0.6 + overlap / 10;
    }
    if (score > 0 && (!best || score > best.score)) best = { supplier, score };
  }
  return best?.supplier ?? null;
}
