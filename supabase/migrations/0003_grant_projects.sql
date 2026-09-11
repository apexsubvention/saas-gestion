-- 0003_grant_projects.sql

create table grant_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  program_id uuid not null references grant_programs(id),
  name text not null,
  status text not null default 'prospect' check (status in (
    'prospect','qualifying','preparing','submitted','under_review',
    'approved','active','final_claim','completed','rejected','cancelled'
  )),
  official_start_date date,
  official_end_date date,
  internal_target_end_date date,
  total_project_cost numeric(14,2),
  approved_grant_amount numeric(14,2),
  grant_rate numeric(5,4) check (grant_rate is null or (grant_rate >= 0 and grant_rate <= 1)),
  owner_id uuid references organization_users(id),
  claim_frequency text,
  description text,
  health_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
