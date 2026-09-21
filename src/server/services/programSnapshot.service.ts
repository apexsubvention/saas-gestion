import type { SupabaseClient } from "@supabase/supabase-js";
import { programsRepository } from "@/server/repositories/programs.repository";
import { buildProgramSnapshot, type ProgramSnapshot } from "@/features/grants/programSnapshot";

export type SnapshotRow = { id: string; reason: "creation" | "manual"; snapshot: ProgramSnapshot; taken_at: string; taken_by: string | null };

export function programSnapshotService(supabase: SupabaseClient) {
  return {
    // Fige les règles ACTUELLES du programme pour ce dossier. Une ligne de plus, jamais de modification d'un ancien snapshot.
    async take(ctx: { organizationId: string; organizationUserId: string }, grantProjectId: string, programId: string, reason: "creation" | "manual"): Promise<string> {
      const program = await programsRepository(supabase).findById(programId);
      if (!program) throw new Error("Programme introuvable.");
      const { data, error } = await supabase
        .from("program_snapshots")
        .insert({ organization_id: ctx.organizationId, grant_project_id: grantProjectId, program_id: programId, reason, snapshot: buildProgramSnapshot(program), taken_by: ctx.organizationUserId })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    // Best effort à la création du dossier : ne fait jamais échouer la création (ex. migration 0038 pas appliquée).
    async takeOnCreation(ctx: { organizationId: string; organizationUserId: string }, grantProjectId: string, programId: string): Promise<void> {
      try {
        await this.take(ctx, grantProjectId, programId, "creation");
      } catch {
        /* facultatif */
      }
    },

    async list(grantProjectId: string): Promise<SnapshotRow[]> {
      try {
        const { data, error } = await supabase
          .from("program_snapshots")
          .select("id, reason, snapshot, taken_at, taken_by")
          .eq("grant_project_id", grantProjectId)
          .order("taken_at", { ascending: false });
        if (error) return [];
        return (data ?? []) as SnapshotRow[];
      } catch {
        return [];
      }
    },
  };
}
