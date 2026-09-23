-- 0041_ddr_pari_cnrc.sql
--
-- Demandes de remboursement (DDR) du PARI CNRC / IRAP : rapports d'avancement périodiques exigés
-- par ce programme (un par période, généralement mensuelle, jusqu'à la fin du projet). Apex génère
-- le calendrier des DDR à partir des dates de l'entente et des objectifs du projet, pré-rédige le
-- contenu (modifiable), et permet d'ajuster le nombre de DDR restants si le rythme réel diffère.
--
--  1. grant_project_objectives : objectifs initiaux du projet, saisis une fois par dossier (source
--     de vérité pour la section « OBJECTIF 1, 2, 3... » reprise dans chaque DDR).
--  2. ddr_reports : un DDR = une période, avec son propre texte (activités, avancement par objectif,
--     variations) -- éditable, jamais régénéré en écrasant une version déjà modifiée sans confirmation.
--  3. grant_projects.external_project_number : numéro de dossier attribué par le bailleur de fonds
--     (ex. numéro de projet PARI-CNRC), utile sur ce programme et potentiellement d'autres.

alter table grant_projects add column external_project_number text;

-- ============================================================
-- 1. Objectifs du projet
-- ============================================================
create table grant_project_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  position int not null default 0,
  label text not null check (length(label) between 1 and 600), -- ex. « Augmenter le taux de conversion autonome de 10 % à au moins 20 % »
  created_at timestamptz not null default now()
);
create index idx_grant_project_objectives_project on grant_project_objectives(grant_project_id, position);

alter table grant_project_objectives enable row level security;

create policy "grant_project_objectives_select" on grant_project_objectives
  for select using (can_access_grant_project(grant_project_id));

create policy "grant_project_objectives_insert" on grant_project_objectives
  for insert with check (
    is_org_member(organization_id)
    and is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
  );

create policy "grant_project_objectives_update" on grant_project_objectives
  for update
  using (can_access_grant_project(grant_project_id))
  with check (is_org_member(organization_id) and is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create policy "grant_project_objectives_delete" on grant_project_objectives
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

-- ============================================================
-- 2. Rapports DDR
-- ============================================================
create table ddr_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  ddr_number int not null check (ddr_number > 0),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  on_schedule boolean not null default true,
  delay_justification text check (delay_justification is null or length(delay_justification) <= 2000),
  new_end_date date,
  address_changed boolean not null default false,
  company_name_changed boolean not null default false,
  activities_text text check (activities_text is null or length(activities_text) <= 8000),
  variations_text text check (variations_text is null or length(variations_text) <= 4000),
  -- Un élément par objectif au moment de ce DDR : [{ "objective_id": uuid|null, "label": text, "progress_percent": int|null, "narrative": text }]
  objectives_snapshot jsonb not null default '[]',
  prepared_by_name text,
  prepared_by_title text,
  signature_date date,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  generated_by text not null default 'ai' check (generated_by in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grant_project_id, ddr_number)
);
create index idx_ddr_reports_project on ddr_reports(grant_project_id, ddr_number);

alter table ddr_reports enable row level security;

create policy "ddr_reports_select" on ddr_reports
  for select using (can_access_grant_project(grant_project_id));

create policy "ddr_reports_insert" on ddr_reports
  for insert with check (
    is_org_member(organization_id)
    and is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
  );

create policy "ddr_reports_update" on ddr_reports
  for update
  using (can_access_grant_project(grant_project_id))
  with check (is_org_member(organization_id) and is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create policy "ddr_reports_delete" on ddr_reports
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
