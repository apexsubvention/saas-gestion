import type { SupabaseClient } from "@supabase/supabase-js";
import { programsRepository, type ProgramRow } from "@/server/repositories/programs.repository";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { apexSheetText, clientInfoText, splitSourcePages } from "@/features/programs/qa/bundle";
import { runAnalysis, MAX_PROJECT_TEXT, type AnalysisResult, type SourceDoc } from "@/features/drafting/analyze";
import { checkExpense, type ExpenseCheck } from "@/features/drafting/expense";
import { GRANT_PROJECT_STATUS_LABELS } from "@/features/grants/constants";

export type AnalysisRow = { id: string; description: string; result: AnalysisResult; score: number | null; created_at: string };

type Loaded = { program: ProgramRow; docs: SourceDoc[]; context: string; clientNeeds: string | null };

const money = (n: unknown) => (n == null ? "non précisé" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(n)));

export function draftingService(supabase: SupabaseClient) {
  // Documents du programme (pages officielles + fiche Apex) et contexte du dossier.
  async function load(grantProjectId: string): Promise<Loaded> {
    const project: any = await grantProjectsService(supabase).get(grantProjectId);
    if (!project) throw new Error("Dossier introuvable.");
    const program = await programsRepository(supabase).findById(project.program_id);
    if (!program) throw new Error("Programme du dossier introuvable.");

    const { data: client } = await supabase.from("clients").select("name, sector, website, current_needs, notes").eq("id", project.client_id).maybeSingle();
    const suppliers = await projectSuppliersService(supabase).listByProject(grantProjectId);
    const budgetTotal = suppliers.reduce((s, x) => s + (x.budget_amount != null ? Number(x.budget_amount) : 0), 0);

    const docs: SourceDoc[] = [
      ...splitSourcePages(program.source_text, program.source_url).map((p, i) => ({ title: p.url ?? `Page officielle ${i + 1}`, text: p.text.slice(0, 40_000) })),
      { title: "Fiche Apex (données structurées)", text: apexSheetText(program) },
    ];
    const context = [
      client ? clientInfoText(client as Parameters<typeof clientInfoText>[0]) : `Client : ${project.clients?.name ?? "—"}`,
      `Dossier : ${project.name} — statut : ${GRANT_PROJECT_STATUS_LABELS[project.status] ?? project.status}`,
      `Coût total du projet : ${money(project.total_project_cost)} ; subvention approuvée : ${money(project.approved_grant_amount)} ; taux : ${project.grant_rate == null ? "non précisé" : `${Math.round(Number(project.grant_rate) * 10000) / 100} %`}`,
      suppliers.length > 0 ? `Budget prévu des fournisseurs : ${money(budgetTotal)} (${suppliers.map((s) => s.name).join(", ")})` : null,
    ].filter(Boolean).join("\n");
    return { program, docs, context, clientNeeds: (client as { current_needs: string | null } | null)?.current_needs ?? null };
  }

  return {
    load,

    async analyze(ctx: { organizationId: string; organizationUserId: string }, grantProjectId: string, projectText: string): Promise<{ result: AnalysisResult; id: string | null }> {
      const text = projectText.trim();
      if (text.length < 20) throw new Error("Décris le projet en quelques phrases (20 caractères minimum).");
      if (text.length > MAX_PROJECT_TEXT) throw new Error(`Description trop longue (maximum ${MAX_PROJECT_TEXT} caractères).`);
      const loaded = await load(grantProjectId);
      const { result, model } = await runAnalysis({ docs: loaded.docs, context: loaded.context, projectText: text });

      let id: string | null = null;
      try {
        const { data } = await supabase
          .from("project_analyses")
          .insert({ organization_id: ctx.organizationId, grant_project_id: grantProjectId, description: text, result, score: result.compatibility.score, model, created_by: ctx.organizationUserId })
          .select("id")
          .single();
        id = (data as { id: string } | null)?.id ?? null;
      } catch {
        /* historique facultatif */
      }
      return { result, id };
    },

    async checkExpense(grantProjectId: string, expense: string, amount: number | null): Promise<ExpenseCheck> {
      const text = expense.trim();
      if (text.length < 3) throw new Error("Décris la dépense.");
      if (text.length > 500) throw new Error("Description de la dépense trop longue (500 caractères maximum).");
      const loaded = await load(grantProjectId);
      return checkExpense({ docs: loaded.docs, expense: text, amount });
    },

    async listAnalyses(grantProjectId: string, limit = 10): Promise<AnalysisRow[]> {
      try {
        const { data, error } = await supabase
          .from("project_analyses")
          .select("id, description, result, score, created_at")
          .eq("grant_project_id", grantProjectId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return []; // ex. migration 0037 pas encore appliquée
        return (data ?? []) as AnalysisRow[];
      } catch {
        return [];
      }
    },
  };
}
