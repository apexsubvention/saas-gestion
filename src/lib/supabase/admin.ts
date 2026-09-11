// Client Supabase avec la service_role key : CONTOURNE LA RLS.
// A utiliser UNIQUEMENT dans server/services et server/jobs pour des operations
// systeme explicitement justifiees (provisioning d'organisation, ecriture d'audit_logs,
// notifications generees par job, etc). Ne jamais importer cote client ni exposer
// cette cle au navigateur.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
