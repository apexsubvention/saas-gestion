import type { SupabaseClient } from "@supabase/supabase-js";

// Postes du budget DÉPOSÉ au programme -- section « Ce qui a été déposé » d'un dossier (0068).
// Distinct de billing_line_items (facturation au CLIENT, table séparée -- décision explicite de
// Jade : deux tableaux, jamais fusionnés). Voir supabase/migrations/0006_suppliers_budget_tasks.sql
// (table d'origine, jamais utilisée avant 0068) et 0068_budget_lines_deposited.sql (colonnes
// Tracked ajoutées ici, même pattern que project_suppliers -- voir supplierLedger.service.ts).

export type BudgetLineRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  category: string;
  supplier_id: string | null;
  position: number;
  deposited_amount_auto: number | null;
  deposited_amount_override: number | null;
  deposited_amount_override_by: string | null;
  deposited_amount_override_at: string | null;
  accepted_amount_auto: number | null;
  accepted_amount_override: number | null;
  accepted_amount_override_by: string | null;
  accepted_amount_override_at: string | null;
  subsidy_rate_auto: number | null; // fraction 0-1
  subsidy_rate_override: number | null;
  source: "ai" | "manual";
};

// Poste proposé par la lecture automatique de la convention (voir analyzeConventionBudget.ts) --
// deposited/accepted/subsidy_rate sont écrits dans les colonnes _auto, jamais _override.
export type BudgetLineAiInput = {
  category: string;
  supplier_id?: string | null;
  deposited_amount: number | null;
  accepted_amount: number | null;
  subsidy_rate: number | null;
};

export function budgetLinesRepository(supabase: SupabaseClient) {
  async function listByProject(grantProjectId: string): Promise<BudgetLineRow[]> {
    const { data, error } = await supabase
      .from("budget_lines")
      .select("*")
      .eq("grant_project_id", grantProjectId)
      .order("position", { ascending: true });
    if (error) throw error;
    return data as BudgetLineRow[];
  }

  // Génération/régénération depuis la convention : retrouve chaque poste par CATÉGORIE (comparaison
  // insensible à la casse/espaces) pour ne jamais perdre un override déjà saisi dessus -- contrairement
  // à billingLineItemsRepository.replaceAll (qui supprime/réinsère tout), ici seules les colonnes
  // _auto sont écrites sur un poste déjà existant. Une catégorie qui n'apparaît plus dans la nouvelle
  // lecture est retirée SEULEMENT si elle ne porte aucun override manuel (jamais de perte silencieuse
  // d'une correction faite à la main).
  async function replaceAllFromAi(organizationId: string, grantProjectId: string, items: BudgetLineAiInput[]): Promise<BudgetLineRow[]> {
    const existing = await listByProject(grantProjectId);
    const byCategory = new Map(existing.map((l) => [l.category.trim().toLowerCase(), l]));
    const keepIds = new Set<string>();
    const results: BudgetLineRow[] = [];

    for (const [position, item] of items.entries()) {
      const match = byCategory.get(item.category.trim().toLowerCase());
      if (match) {
        keepIds.add(match.id);
        const { data, error } = await supabase
          .from("budget_lines")
          .update({
            supplier_id: item.supplier_id ?? match.supplier_id,
            deposited_amount_auto: item.deposited_amount,
            accepted_amount_auto: item.accepted_amount,
            subsidy_rate_auto: item.subsidy_rate,
            source: "ai",
            position,
          })
          .eq("id", match.id)
          .select()
          .single();
        if (error) throw error;
        results.push(data as BudgetLineRow);
      } else {
        const { data, error } = await supabase
          .from("budget_lines")
          .insert({
            organization_id: organizationId,
            grant_project_id: grantProjectId,
            category: item.category,
            supplier_id: item.supplier_id ?? null,
            deposited_amount_auto: item.deposited_amount,
            accepted_amount_auto: item.accepted_amount,
            subsidy_rate_auto: item.subsidy_rate,
            source: "ai",
            position,
          })
          .select()
          .single();
        if (error) throw error;
        results.push(data as BudgetLineRow);
      }
    }

    const toRemove = existing.filter(
      (l) => !keepIds.has(l.id) && l.deposited_amount_override == null && l.accepted_amount_override == null && l.subsidy_rate_override == null
    );
    if (toRemove.length > 0) {
      const { error } = await supabase.from("budget_lines").delete().in("id", toRemove.map((l) => l.id));
      if (error) throw error;
    }
    return results;
  }

  async function create(input: {
    organization_id: string;
    grant_project_id: string;
    category: string;
    supplier_id: string | null;
    deposited_amount: number | null;
    accepted_amount: number | null;
    subsidy_rate: number | null;
    position: number;
  }): Promise<BudgetLineRow> {
    const { data, error } = await supabase
      .from("budget_lines")
      .insert({
        organization_id: input.organization_id,
        grant_project_id: input.grant_project_id,
        category: input.category,
        supplier_id: input.supplier_id,
        deposited_amount_override: input.deposited_amount,
        accepted_amount_override: input.accepted_amount,
        subsidy_rate_override: input.subsidy_rate,
        source: "manual",
        position: input.position,
      })
      .select()
      .single();
    if (error) throw error;
    return data as BudgetLineRow;
  }

  async function update(
    id: string,
    patch: Partial<
      Pick<
        BudgetLineRow,
        | "category"
        | "supplier_id"
        | "deposited_amount_override"
        | "deposited_amount_override_by"
        | "deposited_amount_override_at"
        | "accepted_amount_override"
        | "accepted_amount_override_by"
        | "accepted_amount_override_at"
        | "subsidy_rate_override"
      >
    >
  ): Promise<BudgetLineRow> {
    const { data, error } = await supabase.from("budget_lines").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data as BudgetLineRow;
  }

  async function remove(id: string): Promise<number> {
    const { data, error } = await supabase.from("budget_lines").delete().eq("id", id).select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  return { listByProject, replaceAllFromAi, create, update, remove };
}
