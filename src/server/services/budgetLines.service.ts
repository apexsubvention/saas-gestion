import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetLinesRepository, type BudgetLineAiInput } from "@/server/repositories/budgetLines.repository";
import { projectSuppliersRepository } from "@/server/repositories/projectSuppliers.repository";
import type { Tracked } from "@/server/services/supplierLedger.service";

// Section « Ce qui a été déposé » (0068) : un poste = une catégorie de dépense telle que soumise au
// programme, avec son montant déposé, son montant accepté et son % de subvention -- chacun suivi
// (Tracked, même pattern que project_suppliers) pour toujours pouvoir revenir à la valeur lue
// automatiquement sans jamais la perdre.

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export type BudgetLineView = {
  id: string;
  category: string;
  supplierId: string | null;
  supplierName: string | null;
  source: "ai" | "manual";
  deposited: Tracked;
  accepted: Tracked;
  rate: Tracked; // fraction 0-1
};

export type BudgetLinesResult = {
  lines: BudgetLineView[];
  totals: { deposited: number; accepted: number };
};

function tracked(auto: number | null, override: number | null): Tracked {
  if (override != null) return { effective: override, auto, override, mode: "manual" };
  if (auto != null) return { effective: auto, auto, override: null, mode: "auto" };
  return { effective: null, auto: null, override: null, mode: "none" };
}

export function budgetLinesService(supabase: SupabaseClient) {
  const repo = budgetLinesRepository(supabase);
  const suppliersRepo = projectSuppliersRepository(supabase);

  return {
    async load(grantProjectId: string): Promise<BudgetLinesResult> {
      const [rows, suppliers] = await Promise.all([repo.listByProject(grantProjectId), suppliersRepo.listByProject(grantProjectId)]);
      const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
      const lines: BudgetLineView[] = rows.map((r) => ({
        id: r.id,
        category: r.category,
        supplierId: r.supplier_id,
        supplierName: r.supplier_id ? supplierNameById.get(r.supplier_id) ?? null : null,
        source: r.source,
        deposited: tracked(num(r.deposited_amount_auto), num(r.deposited_amount_override)),
        accepted: tracked(num(r.accepted_amount_auto), num(r.accepted_amount_override)),
        rate: tracked(num(r.subsidy_rate_auto), num(r.subsidy_rate_override)),
      }));
      const sum = (pick: (l: BudgetLineView) => number | null) => Math.round(lines.reduce((s, l) => s + (pick(l) ?? 0), 0) * 100) / 100;
      return {
        lines,
        totals: { deposited: sum((l) => l.deposited.effective), accepted: sum((l) => l.accepted.effective) },
      };
    },

    listByProject: repo.listByProject,

    // Écrit uniquement les colonnes _auto (jamais un override déjà saisi) -- voir
    // budgetLinesRepository.replaceAllFromAi pour le détail du rapprochement par catégorie.
    generateFromAi: (organizationId: string, grantProjectId: string, items: BudgetLineAiInput[]) =>
      repo.replaceAllFromAi(organizationId, grantProjectId, items),

    async createManual(
      organizationId: string,
      grantProjectId: string,
      input: { category: string; supplier_id: string | null; deposited_amount: number | null; accepted_amount: number | null; subsidy_rate: number | null }
    ) {
      const existing = await repo.listByProject(grantProjectId);
      return repo.create({ organization_id: organizationId, grant_project_id: grantProjectId, position: existing.length, ...input });
    },

    updateCategoryAndSupplier: (id: string, patch: { category: string; supplier_id: string | null }) => repo.update(id, patch),

    remove: repo.remove,

    // value = null -> revenir à l'automatique (efface seulement l'override, jamais la valeur auto).
    async setOverride(lineId: string, field: "deposited" | "accepted" | "rate", value: number | null, organizationUserId: string) {
      const stamp = value == null ? { by: null, at: null } : { by: organizationUserId, at: new Date().toISOString() };
      if (field === "deposited") return repo.update(lineId, { deposited_amount_override: value, deposited_amount_override_by: stamp.by, deposited_amount_override_at: stamp.at });
      if (field === "accepted") return repo.update(lineId, { accepted_amount_override: value, accepted_amount_override_by: stamp.by, accepted_amount_override_at: stamp.at });
      // Le taux n'a pas de colonnes _by/_at (moins critique à tracer que des montants) -- voir migration 0068.
      return repo.update(lineId, { subsidy_rate_override: value });
    },
  };
}
