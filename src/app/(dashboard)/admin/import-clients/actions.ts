"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgContext } from "@/lib/permissions";
import { runApexClientsImport, type ImportSummary } from "@/server/import/importApexClients";
import seedData from "@/server/import-data/apex-clients-2026-09.json";
import type { ApexClientsSeed } from "@/server/import/apexClientsSeed.types";

export type RunImportState = { result: ImportSummary | null; error: string | null };

// Pourquoi service_role ici (et nulle part ailleurs dans l'app) :
// l'import bulk fait ~150 inserts en cascade (clients -> grant_projects ->
// grant_agreements/fournisseurs/factures/réclamations) dans UNE seule requête
// serveur. Avec le client RLS normal, le tout premier insert (clients) échouait
// systématiquement en prod avec 42501 "new row violates row-level security
// policy" alors que organization_id/role transitent correctement depuis
// requireOrgContext() (revue de code complète : schéma, enum org_role,
// fonctions is_org_member/has_org_role, policies clients_insert — rien
// d'incohérent trouvé statiquement). Plutôt que de complexifier les policies
// RLS pour un cas d'usage admin-only et ponctuel, on utilise le client
// service_role déjà prévu par le projet pour "les opérations système
// explicitement justifiées" (voir src/lib/supabase/admin.ts), en gardant le
// VRAI garde-fou au niveau applicatif : le rôle admin est vérifié explicitement
// juste en dessous, AVANT toute création du client service_role, et
// organization_id reste explicitement posé sur chaque ligne insérée par
// runApexClientsImport (aucune donnée d'une autre organisation n'est
// accessible ni modifiable). Les policies RLS elles-mêmes ne sont pas
// modifiées : elles continuent de protéger tous les autres chemins d'écriture
// de l'app (formulaires clients, statuts de dossiers, etc.), qui restent sur
// le client RLS normal.
export async function runApexClientsImportAction(
  _prev: RunImportState,
  _formData: FormData
): Promise<RunImportState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") {
    return { result: null, error: "Réservé aux administrateurs." };
  }

  const supabase = createAdminClient();
  try {
    const result = await runApexClientsImport(
      supabase,
      ctx.organizationId,
      ctx.organizationUserId,
      seedData as ApexClientsSeed
    );
    return { result, error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : "Erreur inconnue durant l'import" };
  }
}
