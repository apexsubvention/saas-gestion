import type { SupabaseClient } from "@supabase/supabase-js";
import { billingInstallmentsRepository, type BillingInstallmentRow, type BillingInstallmentUpdate } from "@/server/repositories/billingInstallments.repository";
import { billingLineItemsRepository } from "@/server/repositories/billingLineItems.repository";
import { computeBillingPeriods, splitAmountEvenly } from "@/features/billing/schedule";
import { draftBillingBatch, type BillingPeriodToGenerate } from "@/features/billing/draftBilling";

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function billingInstallmentsService(supabase: SupabaseClient) {
  const repo = billingInstallmentsRepository(supabase);
  const lineItemsRepo = billingLineItemsRepository(supabase);

  // Rédige (IA, best-effort) puis insère un lot de périodes, avec le montant de chacune déjà calculé
  // par Apex (jamais par l'IA). Si la rédaction échoue (clé API absente, panne, timeout), le
  // calendrier est quand même créé -- texte vide, modifiable à la main -- plutôt que de bloquer la
  // création du calendrier sur une panne de l'IA.
  async function draftAndInsert(input: {
    organizationId: string;
    grantProjectId: string;
    clientName: string;
    programName: string;
    projectName: string;
    periods: { installment_number: number; period_start: string; period_end: string }[];
    amounts: number[]; // même longueur/ordre que periods
    activities: { label: string; description: string | null; amount: number; hours: number | null }[];
    priorSummary: string | null;
  }): Promise<BillingInstallmentRow[]> {
    const periodsToGenerate: BillingPeriodToGenerate[] = input.periods.map((p) => ({
      installment_number: p.installment_number,
      period_start: p.period_start,
      period_end: p.period_end,
    }));

    let drafted: Awaited<ReturnType<typeof draftBillingBatch>> = [];
    try {
      drafted = await draftBillingBatch({
        clientName: input.clientName,
        programName: input.programName,
        projectName: input.projectName,
        activities: input.activities,
        periods: periodsToGenerate,
        priorSummary: input.priorSummary,
      });
    } catch {
      drafted = [];
    }
    const byNumber = new Map(drafted.map((d) => [d.installment_number, d]));

    const rows = input.periods.map((p, i) => ({
      organization_id: input.organizationId,
      grant_project_id: input.grantProjectId,
      installment_number: p.installment_number,
      period_start: p.period_start,
      period_end: p.period_end,
      invoice_description: byNumber.get(p.installment_number)?.invoice_description ?? null,
      amount: input.amounts[i] ?? 0,
      generated_by: "ai" as const,
    }));

    return repo.insertMany(rows);
  }

  return {
    listByProject: (grantProjectId: string) => repo.listByProject(grantProjectId),

    // Génération initiale : crée tout le calendrier de N versements couvrant [projectStart,
    // projectEnd], en répartissant le total des activités acceptées. Refuse si des versements
    // existent déjà -- regenerateRemaining() sert à en ajuster le nombre.
    async generateSchedule(params: {
      organizationId: string;
      grantProjectId: string;
      clientName: string;
      programName: string;
      projectName: string;
      projectStart: string;
      projectEnd: string;
      count: number;
    }): Promise<BillingInstallmentRow[]> {
      const existing = await repo.listByProject(params.grantProjectId);
      if (existing.length > 0) throw new Error("Des versements existent déjà pour ce dossier -- utilise « Ajuster les versements restants » pour les modifier.");
      const lineItems = await lineItemsRepo.listByProject(params.grantProjectId);
      if (lineItems.length === 0) throw new Error("Ajoute d'abord au moins une activité/poste budgétaire accepté.");
      // Seuls les postes cochés « à facturer » (0050) comptent -- un coût interne (ex. salaire)
      // remboursé directement par la subvention ne doit jamais être réparti sur une facture.
      const billableItems = lineItems.filter((it) => it.included_in_billing);
      if (billableItems.length === 0) throw new Error("Aucune activité n'est cochée « à facturer » -- coche au moins un poste ci-dessus avant de générer les versements.");
      const total = billableItems.reduce((sum, it) => sum + Number(it.amount ?? 0), 0);
      if (total <= 0) throw new Error("Le montant total des activités à facturer doit être supérieur à 0.");
      if (params.count <= 0) throw new Error("Le nombre de versements doit être d'au moins 1.");

      const periods = computeBillingPeriods(params.projectStart, params.projectEnd, params.count, 1);
      const amounts = splitAmountEvenly(total, params.count);
      return draftAndInsert({
        organizationId: params.organizationId,
        grantProjectId: params.grantProjectId,
        clientName: params.clientName,
        programName: params.programName,
        projectName: params.projectName,
        periods,
        amounts,
        activities: billableItems.map((it) => ({ label: it.label, description: it.description, amount: Number(it.amount ?? 0), hours: it.hours != null ? Number(it.hours) : null })),
        priorSummary: null,
      });
    },

    // Ajuste le nombre de versements RESTANTS : le client ne facture pas à chaque période prévue,
    // donc moins de versements mais plus longs pour couvrir la même fin de projet. Les versements
    // déjà « submitted » (facturés) sont TOUJOURS préservés tels quels (montant compris) ; seuls les
    // « draft » sont remplacés, et le solde restant du total est reréparti sur les nouveaux versements.
    async regenerateRemaining(params: {
      organizationId: string;
      grantProjectId: string;
      clientName: string;
      programName: string;
      projectName: string;
      projectEnd: string;
      newRemainingCount: number;
    }): Promise<BillingInstallmentRow[]> {
      if (params.newRemainingCount <= 0) throw new Error("Le nombre de versements restants doit être d'au moins 1.");
      const existing = await repo.listByProject(params.grantProjectId);
      const locked = existing.filter((r) => r.status === "submitted").sort((a, b) => a.installment_number - b.installment_number);
      const drafts = existing.filter((r) => r.status === "draft");

      const remainingStart = locked.length > 0 ? addOneDay(locked[locked.length - 1]!.period_end) : drafts.length > 0 ? drafts.sort((a, b) => a.installment_number - b.installment_number)[0]!.period_start : null;
      if (!remainingStart) throw new Error("Aucun calendrier de facturation existant : utilise plutôt « Générer les versements » pour créer le calendrier initial.");

      const lineItems = await lineItemsRepo.listByProject(params.grantProjectId);
      const billableItems = lineItems.filter((it) => it.included_in_billing);
      const total = billableItems.reduce((sum, it) => sum + Number(it.amount ?? 0), 0);
      const lockedTotal = locked.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      const remainingTotal = Math.max(0, total - lockedTotal);

      const periods = computeBillingPeriods(remainingStart, params.projectEnd, params.newRemainingCount, locked.length + 1);
      const amounts = splitAmountEvenly(remainingTotal, params.newRemainingCount);

      for (const d of drafts) await repo.remove(d.id);

      const priorSummary = locked[locked.length - 1]?.invoice_description ?? null;
      return draftAndInsert({
        organizationId: params.organizationId,
        grantProjectId: params.grantProjectId,
        clientName: params.clientName,
        programName: params.programName,
        projectName: params.projectName,
        periods,
        amounts,
        activities: billableItems.map((it) => ({ label: it.label, description: it.description, amount: Number(it.amount ?? 0), hours: it.hours != null ? Number(it.hours) : null })),
        priorSummary,
      });
    },

    update: (id: string, patch: BillingInstallmentUpdate) => repo.update(id, patch),
    remove: (id: string) => repo.remove(id),
  };
}
