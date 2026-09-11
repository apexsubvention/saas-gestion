-- 0010_activities_pipeline.sql

create table activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in (
    'email_received','email_sent','meeting','note',
    'task_created','task_completed',
    'document_uploaded','document_requested',
    'claim_submitted','claim_paid',
    'application_submitted','grant_approved','grant_rejected',
    'budget_updated','client_follow_up'
  )),
  client_id uuid references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  actor_id uuid references organization_users(id),
  created_by_ai boolean not null default false,
  summary text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  stage text not null default 'new_lead' check (stage in (
    'new_lead','to_contact','contacted','discovery','opportunity_identified',
    'proposal','mandate_sent','mandate_accepted','application_preparation',
    'active_client','lost'
  )),
  estimated_value numeric(14,2),
  potential_program uuid references grant_programs(id),
  probability numeric(5,4) check (probability is null or (probability >= 0 and probability <= 1)),
  next_action text,
  owner_id uuid references organization_users(id),
  created_at timestamptz not null default now()
);
