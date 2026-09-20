import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const createProgramSchema = z.object({
  // Requis seulement s'il n'y a pas d'URL : avec une URL, le nom peut être repris de la page.
  name: optionalText(200),
  agency: optionalText(200),
  description: optionalText(5000),
  program_type: optionalText(100),
  territory: optionalText(200),
  source_url: z.string().trim().max(2000).url("URL invalide (ex. https://…)").optional().or(z.literal("")),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

const AVAILABILITY = ["open", "opening_soon", "continuous", "closed", "unknown"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable();

// Modification manuelle d'une fiche (corriger ce que la lecture automatique a mal compris).
export const updateProgramSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  agency: optionalText(200),
  program_type: optionalText(100),
  territory: optionalText(200),
  description: optionalText(5000),
  source_url: z.string().trim().max(2000).url("URL invalide (ex. https://…)").optional().or(z.literal("")),
  aid_rate_percent: z.number({ invalid_type_error: "Nombre invalide" }).min(0, "Le taux doit être entre 0 et 100").max(100, "Le taux doit être entre 0 et 100").nullable(),
  max_aid_amount: z.number({ invalid_type_error: "Nombre invalide" }).min(0, "Montant invalide").nullable(),
  min_eligible_spend: z.number({ invalid_type_error: "Nombre invalide" }).min(0, "Montant invalide").nullable(),
  open_date: isoDate,
  deadline: isoDate,
  filing_notes: optionalText(800),
  availability_status: z.enum(AVAILABILITY),
  aid_notes: optionalText(1500),
  eligible_expenses: optionalText(3000),
  ineligible_expenses: optionalText(3000),
  application_process: optionalText(3000),
  claim_process: optionalText(3000),
  required_documents: z.array(z.string().trim().min(1).max(300)).max(40),
});
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
