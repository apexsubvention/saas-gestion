import { z } from "zod";

export const createProgramSchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  agency: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  program_type: z.string().max(100).optional().or(z.literal("")),
  territory: z.string().max(200).optional().or(z.literal("")),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
