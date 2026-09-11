import { z } from "zod";

export const createGrantProjectSchema = z.object({
  client_id: z.string().uuid("Client requis"),
  program_id: z.string().uuid("Programme requis"),
  name: z.string().min(1, "Nom requis").max(200),
  total_project_cost: z.coerce.number().nonnegative().optional().nullable(),
  approved_grant_amount: z.coerce.number().nonnegative().optional().nullable(),
  official_start_date: z.string().optional().or(z.literal("")),
  official_end_date: z.string().optional().or(z.literal("")),
});
export type CreateGrantProjectInput = z.infer<typeof createGrantProjectSchema>;
