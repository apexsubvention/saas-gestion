-- 0008_expenses_claims.sql
-- Aucune dependance circulaire : expenses n'a plus de claim_id, claim_expenses assure la liaison.

create table expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  supplier_id uuid references project_suppliers(id),
  invoice_number text,
  invoice_date date,
  subtotal numeric(14,2),
  tax numeric(14,2),
  total numeric(14,2),
  eligible_amount numeric(14,2),
  budget_line_id uuid references budget_lines(id),
  status text not null default 'to_review' check (status in (
    'to_review','compliant','missing_information','potentially_ineligible','rejected'
  )),
  created_at timestamptz not null default now()
);

create table expected_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  supplier_id uuid not null references project_suppliers(id) on delete cascade,
  expected_date date not null,
  status text not null default 'missing' check (status in ('missing','received','not_applicable')),
  linked_expense_id uuid references expenses(id) on delete set null
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  claim_number text,
  period_start date,
  period_end date,
  due_date date,
  submission_date date,
  status text not null default 'planned' check (status in (
    'planned','preparing','missing_documents','ready',
    'submitted','under_review','approved','paid','rejected'
  )),
  eligible_expenses numeric(14,2),
  claimed_amount numeric(14,2),
  approved_amount numeric(14,2),
  paid_amount numeric(14,2),
  progress_report text,
  is_template boolean not null default false,
  ai_version text,
  edited_version text,
  final_version text,
  created_at timestamptz not null default now()
);

create table claim_expenses (
  organization_id uuid not null references organizations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  claimed_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (claim_id, expense_id)
);

create table claim_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  label text not null,
  status text not null default 'missing' check (status in (
    'missing','requested','received','validated','not_required','issue'
  ))
);
