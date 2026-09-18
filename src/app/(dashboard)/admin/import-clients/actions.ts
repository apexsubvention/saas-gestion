"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { runApexClientsImport, type ImportSummary } from "@/server/import/importApexClients";
import seedData from "@/server/import-data/apex-clients-2026-09.json";
import type { ApexClientsSeed } from "@/server/import/apexClientsSeed.types";

export type RunImportState = { result: ImportSummary | null; error: string | null };

export async function runApexClientsImportAction(
  _prev: RunImportState,
  _formData: FormData
): Promise<RunImportState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") {
    return { result: null, error: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();
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
