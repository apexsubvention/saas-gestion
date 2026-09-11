-- 0005_agreements_milestones.sql

create table grant_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  project_start date,
  project_end date,
  eligible_expense_period_start date,
  eligible_expense_period_end date,
  grant_amount numeric(14,2),
  grant_rate numeric(5,4) check (grant_rate is null or (grant_rate >= 0 and grant_rate <= 1)),
  claim_frequency text,
  required_documents text[],
  reporting_requirements text,
  budget_constraints text,
  supplier_rules text,
  special_conditions text,
  raw_ai_output jsonb,
  validated_data jsonb,
  validation_user_id uuid references organization_users(id),
  validation_date timestamptz,
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  type text not null check (type in (
    'claim','report','document','invoice','payment_proof',
    'project_end','client_followup','supplier_followup','other'
  )),
  title text not null,
  official_due_date date,
  internal_due_date date,
  status text not null default 'pending' check (status in ('pending','done','at_risk','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  owner_id uuid references organization_users(id),
  source text not null default 'manual' check (source in ('manual','template','ai_proposed')),
  visible_in_client_portal boolean not null default false,
  created_at timestamptz not null default now()
);
