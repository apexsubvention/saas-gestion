-- 0079_deposits_and_invoice_templates.sql
--
-- Jade, deux ajouts au portail client :
--  1. « Dépôts » : le client inscrit chaque dépôt reçu (date, montant, provenance, référence) avec
--     sa preuve (chèque, avis de virement PDF...) -- facile à suivre pour une comptable.
--  2. Modèle de facture : un fournisseur (ex. Sitegrow) téléverse SA facture vierge (Word) ;
--     Apex la remplit pour chaque versement du plan de facturation. Le brouillon de chaque
--     facture (n° saisi à la main, dates, échéance, description, montant, taxes) est retenu.
--
-- Les écritures du portail passent par le serveur (client admin, après vérification de l'accès),
-- comme les autres actions du portail : la RLS ne donne ici que la LECTURE aux comptes portail.
-- Additif seulement ; peut être relancé sans erreur.

-- Nouvelles catégories de document.
alter table documents drop constraint if exists documents_category_check;
alter table documents add constraint documents_category_check check (category in (
  'application','agreement','invoice','ddr_report','payment_proof','budget','report',
  'claim_form','annex','proposal','bank_statement',
  'email_attachment','meeting_attachment','other',
  'deposit_proof','invoice_template'
));

-- 1. Dépôts reçus -------------------------------------------------------------------------------
create table if not exists subsidy_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete set null,
  deposit_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  payer text,          -- provenance (ex. Services Québec, PARI CNRC)
  reference text,      -- n° de chèque, de virement...
  note text,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references organization_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists subsidy_deposits_client_idx on subsidy_deposits (client_id, deposit_date desc);
create index if not exists subsidy_deposits_project_idx on subsidy_deposits (grant_project_id);

alter table subsidy_deposits enable row level security;
drop policy if exists "subsidy_deposits_select" on subsidy_deposits;
create policy "subsidy_deposits_select" on subsidy_deposits
  for select using (is_org_staff(organization_id) or can_access_client(client_id));
drop policy if exists "subsidy_deposits_insert_staff" on subsidy_deposits;
create policy "subsidy_deposits_insert_staff" on subsidy_deposits
  for insert with check (is_org_staff(organization_id));
drop policy if exists "subsidy_deposits_update_staff" on subsidy_deposits;
create policy "subsidy_deposits_update_staff" on subsidy_deposits
  for update using (is_org_staff(organization_id));
drop policy if exists "subsidy_deposits_delete_staff" on subsidy_deposits;
create policy "subsidy_deposits_delete_staff" on subsidy_deposits
  for delete using (is_org_staff(organization_id));

-- 2. Modèle de facture d'un fournisseur / client (un par client) ---------------------------------
create table if not exists invoice_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade, -- modèle préparé (balises {{...}})
  original_document_id uuid references documents(id) on delete set null, -- fichier tel que téléversé
  tags text[] not null default '{}',
  updated_by uuid references organization_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (client_id)
);

alter table invoice_templates enable row level security;
drop policy if exists "invoice_templates_select" on invoice_templates;
create policy "invoice_templates_select" on invoice_templates
  for select using (is_org_staff(organization_id) or can_access_client(client_id));
drop policy if exists "invoice_templates_write_staff" on invoice_templates;
create policy "invoice_templates_write_staff" on invoice_templates
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

-- Brouillon de la facture d'un versement, par émetteur (le client qui facture).
create table if not exists installment_invoice_drafts (
  installment_id uuid not null references billing_installments(id) on delete cascade,
  issuer_client_id uuid not null references clients(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_number text,
  invoice_date date,
  due_date date,
  period_start date,
  period_end date,
  client_name text,
  client_address text,
  description text,
  amount numeric(14, 2),
  apply_gst boolean not null default true,
  apply_qst boolean not null default true,
  sent_document_id uuid references documents(id) on delete set null,
  updated_by uuid references organization_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (installment_id, issuer_client_id)
);

alter table installment_invoice_drafts enable row level security;
drop policy if exists "installment_invoice_drafts_select" on installment_invoice_drafts;
create policy "installment_invoice_drafts_select" on installment_invoice_drafts
  for select using (is_org_staff(organization_id) or can_access_client(issuer_client_id));
drop policy if exists "installment_invoice_drafts_write_staff" on installment_invoice_drafts;
create policy "installment_invoice_drafts_write_staff" on installment_invoice_drafts
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));
