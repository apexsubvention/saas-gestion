-- 0006_suppliers_budget_tasks.sql

create table project_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  name text not null,
  contact text,
  budget_amount numeric(14,2),
  billing_frequency text,
  expected_invoice_day int,
  invoice_description_requirements text,
  notes text
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  category text not null,
  supplier_id uuid references project_suppliers(id),
  approved_amount numeric(14,2) not null default 0
  -- spent_amount / claimed_amount / paid_amount : calcules, voir vue budget_line_actuals (0016)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  client_id uuid references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  assigned_to uuid references organization_users(id),
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'todo' check (status in (
    'todo','in_progress','waiting_client','waiting_supplier','blocked','done','cancelled'
  )),
  source text not null default 'manual' check (source in (
    'manual','email','meeting','claim','agreement','ai','document'
  )),
  source_id uuid,
  created_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
