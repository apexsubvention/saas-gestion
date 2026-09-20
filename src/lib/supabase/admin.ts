// Client Supabase avec la service_role key : CONTOURNE LA RLS.
// A utiliser UNIQUEMENT dans server/services et server/jobs pour des operations
// systeme explicitement justifiees (provisioning d'organisation, ecriture d'audit_logs,
// notifications generees par job, etc). Ne jamais importer cote client ni exposer
// cette cle au navigateur.
//
// Nom de variable : Supabase a renomme "service_role key" -> "Secret key" dans son
// nouveau système de clés API (avec JWKS). Selon le nom exact utilisé lors de la
// configuration des variables d'environnement Vercel, la clé peut se trouver sous
// SUPABASE_SERVICE_ROLE_KEY (ancien nom, utilisé historiquement par ce fichier) ou
// SUPABASE_SECRET_KEY (nouveau nom Supabase). On accepte les deux pour ne pas dépendre
// d'un renommage silencieux côté dashboard Vercel -- mais il faut confirmer laquelle
// est réellement définie en production et, idéalement, n'en garder qu'une.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

function resolveServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Clé service_role introuvable : ni SUPABASE_SERVICE_ROLE_KEY ni SUPABASE_SECRET_KEY ne sont définies."
    );
  }
  return key;
}

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    resolveServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
