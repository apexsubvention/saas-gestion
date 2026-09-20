// Message lisible pour n'importe quelle erreur levée côté serveur. Une erreur Supabase
// (PostgrestError) n'est pas une instance d'Error : sans ce formatage, la vraie cause
// (RLS, contrainte...) se perd derrière un « Erreur inconnue ».
export function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code].filter((v) => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erreur non sérialisable.";
    }
  }
  return String(e);
}

// Seules les URL http(s) sont affichées comme liens : jamais javascript:, data:, etc.
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
