// Forme du fichier src/server/import-data/apex-clients-2026-09.json, généré à partir des
// dossiers réels du zip "Demande de sub - APEX" fourni par l'utilisateur (lecture assistée
// par IA, aucune donnée inventée — tout champ non trouvé explicitement est `null`).

export type SeedSupplier = { name: string; contact: string | null };
export type SeedExpense = {
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  supplier: string | null;
};
export type SeedClaim = {
  label: string | null;
  period_start: string | null;
  period_end: string | null;
  status_hint: string | null;
};
export type SeedContact = {
  full_name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
};
export type SeedAgreement = {
  project_start: string | null;
  project_end: string | null;
  eligible_expense_period_start: string | null;
  eligible_expense_period_end: string | null;
  grant_amount: number | null;
  grant_rate: number | null;
  special_conditions: string | null;
} | null;

export type SeedProject = {
  source_folder: string;
  category: "a_faire" | "faite_2026" | "sur_hold";
  program_name: string;
  name: string;
  status: string;
  description: string | null;
  official_start_date: string | null;
  official_end_date: string | null;
  total_project_cost: number | null;
  approved_grant_amount: number | null;
  grant_rate: number | null;
  agreement: SeedAgreement;
  suppliers: SeedSupplier[];
  expenses: SeedExpense[];
  claims: SeedClaim[];
  contacts: SeedContact[];
};

export type SeedClient = {
  name: string;
  name_alt: string | null;
  status: string;
  projects: SeedProject[];
};

export type ApexClientsSeed = { clients: SeedClient[] };
