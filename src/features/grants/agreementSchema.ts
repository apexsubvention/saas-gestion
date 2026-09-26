import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable();
const money = z.number({ invalid_type_error: "Montant invalide" }).min(0, "Montant invalide").nullable();

// Saisie manuelle de l'entente de convention. grant_rate est saisi en % (0-100) et stocké en fraction.
export const saveAgreementSchema = z
  .object({
    project_start: isoDate,
    project_end: isoDate,
    eligible_expense_period_start: isoDate,
    eligible_expense_period_end: isoDate,
    grant_amount: money,
    grant_rate_percent: z.number({ invalid_type_error: "Taux invalide" }).min(0, "Le taux doit être entre 0 et 100").max(100, "Le taux doit être entre 0 et 100").nullable(),
    claim_frequency: z.string().trim().max(300).optional().or(z.literal("")),
    special_conditions: z.string().trim().max(5000).optional().or(z.literal("")),
    // (0060) Délai de paiement/facturation -- si rien n'est indiqué, la règle par défaut
    // (appliquée ailleurs) est : tout doit être payé et facturé d'ici la fin du projet.
    payment_deadline_date: isoDate,
    payment_deadline_days_after_end: z.number({ invalid_type_error: "Nombre de jours invalide" }).int().min(0, "Le délai doit être positif").max(3650, "Le délai est trop long").nullable(),
  })
  .refine((v) => !v.project_start || !v.project_end || v.project_end >= v.project_start, { message: "La fin du projet doit être après son début.", path: ["project_end"] })
  .refine(
    (v) => !v.eligible_expense_period_start || !v.eligible_expense_period_end || v.eligible_expense_period_end >= v.eligible_expense_period_start,
    { message: "La fin de la période d'admissibilité doit être après son début.", path: ["eligible_expense_period_end"] }
  );
export type SaveAgreementInput = z.infer<typeof saveAgreementSchema>;
