import type { SupabaseClient } from "@supabase/supabase-js";

// Dépôts reçus (0079, Jade) : chaque dépôt inscrit par le client dans l'onglet « Dépôts » du
// portail -- date, montant reçu, provenance, référence, preuve (chèque, avis de virement...).
// Lecture : RLS (subsidy_deposits_select -- personnel, ou client/parent via can_access_client).
// Écriture depuis le portail : client admin, après vérification de l'accès (voir depositActions.ts).

export type SubsidyDeposit = {
  id: string;
  clientId: string;
  clientName: string | null;
  grantProjectId: string | null;
  grantProjectName: string | null;
  depositDate: string;
  amount: number;
  payer: string | null;
  reference: string | null;
  note: string | null;
  document: { id: string; filename: string; storagePath: string } | null;
  createdAt: string;
};

type Row = {
  id: string;
  client_id: string;
  grant_project_id: string | null;
  deposit_date: string;
  amount: number | string;
  payer: string | null;
  reference: string | null;
  note: string | null;
  document_id: string | null;
  created_at: string;
  clients: { name: string } | null;
  grant_projects: { name: string } | null;
  documents: { id: string; filename: string; storage_path: string } | null;
};

const SELECT = "id, client_id, grant_project_id, deposit_date, amount, payer, reference, note, document_id, created_at, clients(name), grant_projects(name), documents(id, filename, storage_path)";

function toDeposit(r: Row): SubsidyDeposit {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.clients?.name ?? null,
    grantProjectId: r.grant_project_id,
    grantProjectName: r.grant_projects?.name ?? null,
    depositDate: r.deposit_date,
    amount: Number(r.amount),
    payer: r.payer,
    reference: r.reference,
    note: r.note,
    document: r.documents ? { id: r.documents.id, filename: r.documents.filename, storagePath: r.documents.storage_path } : null,
    createdAt: r.created_at,
  };
}

export function subsidyDepositsService(supabase: SupabaseClient) {
  return {
    /** Tous les dépôts visibles (RLS). null si la migration 0079 n'est pas encore passée. */
    async list(): Promise<SubsidyDeposit[] | null> {
      const { data, error } = await supabase.from("subsidy_deposits").select(SELECT).order("deposit_date", { ascending: false }).limit(1000);
      if (error) {
        if (/subsidy_deposits/.test(error.message ?? "")) return null;
        throw error;
      }
      return ((data ?? []) as unknown as Row[]).map(toDeposit);
    },

    async listByProject(grantProjectId: string): Promise<SubsidyDeposit[]> {
      const { data, error } = await supabase.from("subsidy_deposits").select(SELECT).eq("grant_project_id", grantProjectId).order("deposit_date", { ascending: false });
      if (error) return []; // migration 0079 absente : rien à montrer
      return ((data ?? []) as unknown as Row[]).map(toDeposit);
    },

    async create(input: {
      organization_id: string;
      client_id: string;
      grant_project_id: string | null;
      deposit_date: string;
      amount: number;
      payer: string | null;
      reference: string | null;
      note: string | null;
      document_id: string | null;
      created_by: string | null;
    }): Promise<string> {
      const { data, error } = await supabase.from("subsidy_deposits").insert(input).select("id").single();
      if (error) {
        if (/subsidy_deposits/.test(error.message ?? "")) throw new Error("L'onglet Dépôts n'est pas encore activé : la migration 0079 doit être passée dans Supabase.");
        throw error;
      }
      return (data as { id: string }).id;
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from("subsidy_deposits").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
