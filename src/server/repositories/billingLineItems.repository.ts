import type { SupabaseClient } from "@supabase/supabase-js";

// Activités/postes budgétaires acceptés d'un dossier (source de vérité pour l'aide à la facturation)
// -- voir 0042_billing_aid.sql.

export type BillingLineItemRow = {
  id: string;
  organization_id: string;
  grant_project_id: string;
  position: number;
  label: string;
  description: string | null;
  amount: number;
  hours: number | null;
  source: "ai" | "manual";
  // Coché (0050) = ce poste donne lieu à une facture du client, et son montant entre dans le total
  // réparti sur les versements. Décoché = coût interne (ex. salaire déjà payé par l'entreprise),
  // remboursé directement par la subvention -- jamais facturé, donc jamais compté dans le total.
  included_in_billing: boolean;
  // Pourquoi décoché (0058, Jade) : simple aide-mémoire, jamais lu par un calcul -- aucun montant
  // n'est déplacé automatiquement. null si coché, ou décoché sans raison choisie.
  exclusion_reason: "internal_salary" | "redistribute_supplier" | "new_supplier" | null;
  // Fournisseur associé (0059, Jade) : quand ce poste est coché "À facturer" ET associé à un
  // fournisseur, son montant alimente automatiquement le "Budget prévu" de ce fournisseur dans le
  // tableau Fournisseurs -- voir supplierLedger.service. null si pas encore associé.
  supplier_id: string | null;
  // Taux d'aide spécifique à ce poste (0061, Jade) : fraction 0-1, ex. 0.85 -- remplace le taux du
  // dossier pour calculer la part de Subvention acceptée QUE CE POSTE représente, quand une
  // convention a des taux différents selon le type de frais (ex. formation vs salaire plafonné).
  // null = utilise le taux du dossier (comportement historique).
  subsidy_rate: number | null;
  // Réclamé au programme (0081, Jade) : coche à côté de « À facturer » + la ou les réclamations
  // du dossier (claims.id) dans lesquelles ce poste a été réclamé -- souvent 2.
  claimed_to_program: boolean;
  claimed_claim_ids: string[];
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingLineItemInput = {
  label: string;
  description: string | null;
  amount: number;
  hours: number | null;
  // Optionnel : true par défaut (comportement historique -- tout poste accepté était facturé).
  included_in_billing?: boolean;
  exclusion_reason?: "internal_salary" | "redistribute_supplier" | "new_supplier" | null;
  supplier_id?: string | null;
  subsidy_rate?: number | null;
};

export function billingLineItemsRepository(supabase: SupabaseClient) {
  return {
    // 0081 : coche « Réclamé au programme » + réclamation(s), modifiée seule (sans toucher au reste du poste).
    async setClaimed(id: string, patch: Pick<BillingLineItemRow, "claimed_to_program" | "claimed_claim_ids" | "claimed_by" | "claimed_at">): Promise<BillingLineItemRow> {
      const { data, error } = await supabase.from("billing_line_items").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as BillingLineItemRow;
    },

    async listByProject(grantProjectId: string): Promise<BillingLineItemRow[]> {
      const { data, error } = await supabase
        .from("billing_line_items")
        .select("*")
        .eq("grant_project_id", grantProjectId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as unknown as BillingLineItemRow[];
    },

    // Remplace toute la liste d'un coup (édition en bloc, comme le formulaire de la liste complète) :
    // supprime les anciennes lignes, insère les nouvelles dans l'ordre.
    async replaceAll(organizationId: string, grantProjectId: string, items: BillingLineItemInput[], source: "ai" | "manual"): Promise<BillingLineItemRow[]> {
      // 0081 : « Réclamé au programme » n'est pas saisi dans la liste complète -- reporté ici depuis
      // l'ancien poste de même libellé (insensible à la casse/espaces) pour ne jamais le perdre
      // silencieusement lors d'un enregistrement de la liste ou d'une relecture de la convention.
      const { data: before, error: readError } = await supabase
        .from("billing_line_items")
        .select("label, claimed_to_program, claimed_claim_ids, claimed_by, claimed_at")
        .eq("grant_project_id", grantProjectId);
      if (readError) throw readError;
      type ClaimedState = Pick<BillingLineItemRow, "claimed_to_program" | "claimed_claim_ids" | "claimed_by" | "claimed_at">;
      const claimedByLabel = new Map<string, ClaimedState>();
      for (const r of (before ?? []) as unknown as (ClaimedState & { label: string })[]) {
        if (r.claimed_to_program) claimedByLabel.set(r.label.trim().toLowerCase(), r);
      }
      const { error: delError } = await supabase.from("billing_line_items").delete().eq("grant_project_id", grantProjectId);
      if (delError) throw delError;
      if (items.length === 0) return [];
      const rows = items.map((item, position) => ({
        organization_id: organizationId,
        grant_project_id: grantProjectId,
        position,
        label: item.label,
        description: item.description,
        amount: item.amount,
        hours: item.hours,
        included_in_billing: item.included_in_billing ?? true,
        exclusion_reason: item.exclusion_reason ?? null,
        supplier_id: item.supplier_id ?? null,
        subsidy_rate: item.subsidy_rate ?? null,
        source,
        ...(() => {
          const kept = claimedByLabel.get(item.label.trim().toLowerCase());
          return kept
            ? { claimed_to_program: true, claimed_claim_ids: kept.claimed_claim_ids ?? [], claimed_by: kept.claimed_by, claimed_at: kept.claimed_at }
            : {};
        })(),
      }));
      const { data, error } = await supabase.from("billing_line_items").insert(rows).select();
      if (error) throw error;
      return data as unknown as BillingLineItemRow[];
    },

    async remove(id: string): Promise<number> {
      const { data, error } = await supabase.from("billing_line_items").delete().eq("id", id).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    // Modifie UN SEUL poste en place (0060, Jade) : contrairement à replaceAll (tout supprimer/
    // réinsérer, utilisé par la liste complète d'Aide à la facturation), garde son id/position --
    // utilisé par l'édition inline dans le tableau Fournisseurs (Détails d'un fournisseur).
    async update(id: string, patch: Partial<BillingLineItemInput>): Promise<BillingLineItemRow> {
      const { data, error } = await supabase.from("billing_line_items").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as BillingLineItemRow;
    },
  };
}
