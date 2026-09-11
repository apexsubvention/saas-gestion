-- 0013_notifications_audit.sql

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references organization_users(id),
  type text not null check (type in (
    'deadline','document_missing','invoice_missing','email_waiting',
    'new_prospect','claim_due','budget_warning','client_followup','meeting_task'
  )),
  entity_type text,
  entity_id uuid,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table reminder_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  applies_to text not null,
  days_before int not null
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references organization_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table ai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  use_case text not null,
  input_summary text,
  output jsonb,
  sources jsonb,
  model text,
  latency_ms int,
  created_at timestamptz not null default now()
);
