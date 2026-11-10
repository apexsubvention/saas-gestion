"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/permissions";
import { formatCaughtError } from "@/lib/errors";
import { budgetLinesService } from "@/server/services/budgetLines.service";
import { grantProjectsService } from "@/server/services/grantProjects.service";
import { projectSuppliersService } from "@/server/services/projectSuppliers.service";
import { logDossierEvent } from "@/server/services/audit";
import { analyzeConventionBudget } from "@/features/budget/analyzeConventionBudget";
import { matchSupplier } from "@/features/invoices/matchSupplier";
import { analyzableMime, invoiceAnalysisAvailable, MAX_INVOICE_BYTES } from "@/features/invoices/analyzeInvoice";

// Actions de la section « Ce qui a été déposé » (0068). Même précaution que supplierActions.ts :
// chaque action revérifie que les identifiants reçus appartiennent bien à CE dossier.

export type BudgetLineActionResult = { error: string | null; info?: string | null };

function refresh(grantProjectId: string) {
  revalidatePath(`/grants/${grantProjectId}`);
}

// Génération/régénération du budget déposé à partir d'une convention téléversée directement ici
// (même UX que UploadConventionForm de l'aide à la facturation -- pas de recherche d'un document
// déjà en bibliothèque, un fichier fraîchement choisi à chaque fois). N'écrase jamais un override
// déjà saisi -- voir budgetLinesRepository.replaceAllFromAi.
export async function generateBudgetLinesFromConventionAction(grantProjectId: string, _prev: BudgetLineActionResult, formData: FormData): Promise<BudgetLineActionResult> {
  const ctx = await requireOrgContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisis un fichier (PDF ou image) à téléverser." };
  if (!invoiceAnalysisAvailable()) return { error: "La lecture automatique n'est pas configurée (ANTHROPIC_API_KEY)." };
  const mime = analyzableMime(file.name);
  if (!mime) return { error: "Seuls les PDF et images peuvent être lus automatiquement." };
  if (file.size > MAX_INVOICE_BYTES) return { error: "Fichier trop volumineux pour la lecture automatique (4 Mo maximum)." };

  const supabase = await createClient();
  try {
    const lines = await analyzeConventionBudget({ bytes: await file.arrayBuffer(), mime });
    if (lines.length === 0) return { error: "Convention lue, mais aucun poste budgétaire exploitable n'a été trouvé -- ajoute-les à la main ci-dessous." };

    const suppliers = await projectSuppliersService(supabase).listByProject(grantProjectId);
    const items = lines.map((l) => ({
      category: l.category,
      supplier_id: l.supplier_hint ? matchSupplier(l.supplier_hint, suppliers)?.id ?? null : null,
      deposited_amount: l.deposited_amount,
      accepted_amount: l.accepted_amount,
      subsidy_rate: l.subsidy_rate_percent != null ? Math.round((l.subsidy_rate_percent / 100) * 10000) / 10000 : null,
    }));
    await budgetLinesService(supabase).generateFromAi(ctx.organizationId, grantProjectId, items);
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: "budget_lines_extracted",
      title: `${items.length} poste(s) de budget déposé extrait(s) de la convention`,
      source: "ai",
    });
    refresh(grantProjectId);
    return { error: null, info: `${items.length} poste(s) détecté(s) -- vérifie et corrige les montants ci-dessous, ils restent modifiables.` };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
const money = z.number({ invalid_type_error: "Montant invalide" }).min(0, "Montant invalide").max(100_000_000).nullable();
const ratePercent = z.number({ invalid_type_error: "Taux invalide" }).min(0, "Taux invalide (0 à 100)").max(100, "Taux invalide (0 à 100)").nullable();

const newLineSchema = z.object({
  category: z.string().trim().min(1, "La catégorie est requise.").max(200),
  supplier_id: z.string().uuid().nullable(),
  deposited_amount: money,
  accepted_amount: money,
  subsidy_rate_percent: ratePercent,
});
export type NewBudgetLineInput = z.input<typeof newLineSchema>;

export async function createBudgetLineAction(grantProjectId: string, input: NewBudgetLineInput): Promise<BudgetLineActionResult> {
  const ctx = await requireOrgContext();
  const parsed = newLineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const { supplier_id, deposited_amount, accepted_amount, subsidy_rate_percent, category } = parsed.data;

  const supabase = await createClient();
  try {
    if (supplier_id) {
      const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === supplier_id);
      if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
    }
    await budgetLinesService(supabase).createManual(ctx.organizationId, grantProjectId, {
      category,
      supplier_id,
      deposited_amount,
      accepted_amount,
      subsidy_rate: subsidy_rate_percent != null ? Math.round((subsidy_rate_percent / 100) * 10000) / 10000 : null,
    });
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "budget_line_added", title: `Poste de budget déposé ajouté : ${category}`, source: "manual" });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

async function ownedLine(supabase: Awaited<ReturnType<typeof createClient>>, grantProjectId: string, lineId: string) {
  return (await budgetLinesService(supabase).listByProject(grantProjectId)).some((l) => l.id === lineId);
}

export async function updateBudgetLineAction(grantProjectId: string, lineId: string, category: string, supplierId: string | null): Promise<BudgetLineActionResult> {
  const ctx = await requireOrgContext();
  const trimmed = category.trim();
  if (!trimmed) return { error: "La catégorie est requise." };
  const supabase = await createClient();
  try {
    if (!(await ownedLine(supabase, grantProjectId, lineId))) return { error: "Poste introuvable dans ce dossier." };
    if (supplierId) {
      const owned = (await projectSuppliersService(supabase).listByProject(grantProjectId)).some((s) => s.id === supplierId);
      if (!owned) return { error: "Fournisseur introuvable dans ce dossier." };
    }
    await budgetLinesService(supabase).updateCategoryAndSupplier(lineId, { category: trimmed, supplier_id: supplierId });
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "budget_line_updated", title: `Poste de budget déposé modifié : ${trimmed}`, source: "manual" });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

export async function deleteBudgetLineAction(grantProjectId: string, lineId: string): Promise<BudgetLineActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const lines = await budgetLinesService(supabase).listByProject(grantProjectId);
    const target = lines.find((l) => l.id === lineId);
    if (!target) return { error: "Poste introuvable dans ce dossier." };
    const removed = await budgetLinesService(supabase).remove(lineId);
    if (removed === 0) return { error: "Suppression refusée : tu n'as pas accès à ce dossier." };
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "budget_line_removed", title: `Poste de budget déposé supprimé : ${target.category}`, source: "manual" });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

const OVERRIDE_FIELD_LABELS = { deposited: "Budget déposé", accepted: "Montant accepté", rate: "% de subvention" } as const;

// value = null -> revenir au calcul automatique (efface seulement l'override, jamais la valeur
// lue automatiquement) -- même sémantique que setSupplierOverrideAction (supplierActions.ts).
export async function setBudgetLineOverrideAction(
  grantProjectId: string,
  lineId: string,
  field: "deposited" | "accepted" | "rate",
  value: number | null
): Promise<BudgetLineActionResult> {
  const ctx = await requireOrgContext();
  if (field !== "deposited" && field !== "accepted" && field !== "rate") return { error: "Champ invalide." };
  const max = field === "rate" ? 1 : 100_000_000;
  if (value != null && (!Number.isFinite(value) || value < 0 || value > max)) return { error: "Valeur invalide." };

  const supabase = await createClient();
  try {
    if (!(await ownedLine(supabase, grantProjectId, lineId))) return { error: "Poste introuvable dans ce dossier." };
    await budgetLinesService(supabase).setOverride(lineId, field, value, ctx.organizationUserId);
    const label = OVERRIDE_FIELD_LABELS[field];
    await logDossierEvent(supabase, ctx, {
      grant_project_id: grantProjectId,
      kind: value == null ? "budget_line_override_reverted" : "budget_line_override_set",
      title: value == null ? `${label} : retour au calcul automatique` : `${label} modifié manuellement`,
      source: "manual",
    });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}

// Mode simple (aucun poste détaillé) : totaux directement sur la fiche du dossier -- désormais
// modifiables en tout temps (avant 0068, seulement à la création).
export type UpdateProjectFinancialsResult = { error: string | null };

export async function updateProjectFinancialsAction(
  grantProjectId: string,
  input: { total_project_cost: number | null; approved_grant_amount: number | null; grant_rate_percent: number | null }
): Promise<UpdateProjectFinancialsResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    await grantProjectsService(supabase).updateFinancials(grantProjectId, input);
    await logDossierEvent(supabase, ctx, { grant_project_id: grantProjectId, kind: "project_financials_updated", title: "Coût total / montant approuvé / taux d'aide du dossier modifiés", source: "manual" });
    refresh(grantProjectId);
    return { error: null };
  } catch (e) {
    return { error: formatCaughtError(e) };
  }
}
