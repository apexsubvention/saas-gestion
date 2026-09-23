-- 0042_billing_aid.sql
--
-- Aide à la facturation : à partir des activités/postes ACCEPTÉS dans la convention (montant total
-- déjà accordé, jamais recalculé), Apex prérédige ce qui doit apparaître sur les factures que le
-- client doit produire pour réclamer la subvention, réparti sur N versements couvrant la durée du
-- projet -- éditable, et ajustable si le client ne facture pas au rythme prévu. Généralisé à tous les
-- programmes (contrairement aux DDR, propres au PARI CNRC / IRAP) -- voir 0041_ddr_pari_cnrc.sql pour
-- le précédent architectural (même schéma : liste de base éditable + calendrier régénérable).
--
--  1. billing_line_items : activités/postes budgétaires acceptés d'un dossier, avec leur montant --
--     soit extraits par l'IA depuis la convention téléversée (puis validés/corrigés), soit saisis à
--     la main. Source de vérité pour la répartition sur les versements.
--  2. billing_installments : un versement = une période avec son texte suggéré pour la facture et son
--     montant (réparti automatiquement sur le total des activités, jamais inventé par l'IA) --
--     éditable, jamais régénéré en écrasant une version déjà modifiée sans confirmation.

create table billing_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  position int not null default 0,
  label text not null check (length(label) between 1 and 300),
  description text check (description is null or length(description) <= 2000),
  amount numeric(12, 2) not null default 0,
  hours numeric(8, 2),
  source text not null default 'manual' check (source in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_billing_line_items_project on billing_line_items(grant_project_id, position);

alter table billing_line_items enable row level security;

create policy "billing_line_items_select" on billing_line_items
  for select using (can_access_grant_project(grant_project_id));

create policy "billing_line_items_insert" on billing_line_items
  for insert with check (
    is_org_member(organization_id)
    and is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
  );

create policy "billing_line_items_update" on billing_line_items
  for update
  using (can_access_grant_project(grant_project_id))
  with check (is_org_member(organization_id) and is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create policy "billing_line_items_delete" on billing_line_items
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create table billing_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  installment_number int not null check (installment_number > 0),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  -- Texte suggéré à inscrire sur la facture de ce versement (activités/modules couverts, heures si
  -- pertinent) -- rédigé par l'IA, jamais de montant en dollars dedans (voir amount ci-dessous).
  invoice_description text check (invoice_description is null or length(invoice_description) <= 4000),
  -- Montant de ce versement : réparti automatiquement sur le total des billing_line_items (jamais
  -- inventé par l'IA) -- librement modifiable ensuite.
  amount numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  generated_by text not null default 'ai' check (generated_by in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grant_project_id, installment_number)
);
create index idx_billing_installments_project on billing_installments(grant_project_id, installment_number);

alter table billing_installments enable row level security;

create policy "billing_installments_select" on billing_installments
  for select using (can_access_grant_project(grant_project_id));

create policy "billing_installments_insert" on billing_installments
  for insert with check (
    is_org_member(organization_id)
    and is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
  );

create policy "billing_installments_update" on billing_installments
  for update
  using (can_access_grant_project(grant_project_id))
  with check (is_org_member(organization_id) and is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create policy "billing_installments_delete" on billing_installments
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
