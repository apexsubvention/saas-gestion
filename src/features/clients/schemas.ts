import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1, "Nom requis").max(200),
  status: z.enum(["prospect", "active", "inactive"]).default("prospect"),
  website: z.string().url().optional().or(z.literal("")),
  sector: z.string().max(200).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientNeedsSchema = z.object({
  current_needs: z.string().max(5000).optional().or(z.literal("")),
});

export type UpdateClientNeedsInput = z.infer<typeof updateClientNeedsSchema>;
