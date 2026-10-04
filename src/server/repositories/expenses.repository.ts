import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpenseRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  eligible_amount: number | null;
  status: string;
  source: "manual" | "ai";
  // Jade (0057) : statut de PAIEMENT de la facture -- distinct de `status` (revue de
  // conformité de la dépense, ci-dessus). Modifiable par le personnel ET par le portail
  // (enfant/parent) via des actions dédiées, pas par ce repository directement (voir
  // supplierLedger.service.ts#updatePaymentStatus).
  payment_status: "sent_unpaid" | "paid";
  payment_status_updated_at: string | null;
  payment_status_updated_by: string | null;
  // Jade (0065, PARI CNRC/IRAP) : coût d'un salarié interne pour une période DDR -- s'ajoutent aux
  // montants déjà suivis (subtotal/total/eligible_amount) sans les remplacer. null pour une facture
  // de fournisseur externe ordinaire.
  hours: number | null;
  hourly_rate: number | null;
  // Jade (0073) : facture reçue du portail pour un versement précis (Aide à la facturation) --
  // incohérences détectées à la lecture et brouillon/envoi de la note au client.
  billing_installment_id: string | null;
  review_issues: Array<{ code: string; message: string }> | null;
  review_note: string | null;
  review_note_sent_at: string | null;
  review_note_id: string | null;
};

export type ExpenseReviewPatch = Partial<Pick<ExpenseRow, "billing_installment_id" | "review_issues" | "review_note" | "review_note_sent_at" | "review_note_id">>;

export function expensesRepository(supabase: SupabaseClient) {
  return {
    async listByProject(grantProjectId: string): Promise<ExpenseRow[]> {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data as ExpenseRow[];
    },

    async create(input: {
      organization_id: string;
      grant_project_id: string;
      supplier_id?: string | null;
      invoice_number?: string | null;
      invoice_date?: string | null;
      subtotal?: number | null;
      tax?: number | null;
      total?: number | null;
      eligible_amount?: number | null;
      status?: string;
      source?: "manual" | "ai";
      hours?: number | null;
      hourly_rate?: number | null;
      billing_installment_id?: string | null;
      review_issues?: Array<{ code: string; message: string }>;
      review_note?: string | null;
    }): Promise<ExpenseRow> {
      const { data, error } = await supabase.from("expenses").insert(input).select().single();
      if (error) throw error;
      return data as ExpenseRow;
    },

    async update(
      id: string,
      patch: Partial<Pick<ExpenseRow, "supplier_id" | "invoice_number" | "invoice_date" | "subtotal" | "tax" | "total" | "eligible_amount" | "status" | "hours" | "hourly_rate">>
    ): Promise<ExpenseRow> {
      const { data, error } = await supabase.from("expenses").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as ExpenseRow;
    },

    // Lien versement / incohérences / note au client (0073) -- séparé de update() pour ne jamais
    // toucher aux montants d'une facture déjà saisie à la main en ajoutant seulement son contrôle.
    async updateReview(id: string, patch: ExpenseReviewPatch): Promise<ExpenseRow> {
      const { data, error } = await supabase.from("expenses").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as ExpenseRow;
    },

    // Nombre de lignes supprimées : 0 = refusé par la RLS (ou déjà supprimé).
    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async updatePaymentStatus(id: string, status: "sent_unpaid" | "paid", updatedBy: string | null): Promise<ExpenseRow> {
      const { data, error } = await supabase
        .from("expenses")
        .update({ payment_status: status, payment_status_updated_at: new Date().toISOString(), payment_status_updated_by: updatedBy })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ExpenseRow;
    },
  };
}
