-- 0002_programs.sql

create table grant_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  agency text,
  description text,
  program_type text,
  territory text,
  typical_aid_rate numeric(5,4) check (typical_aid_rate is null or (typical_aid_rate >= 0 and typical_aid_rate <= 1)),
  max_aid_amount numeric(14,2),
  eligible_expenses text,
  ineligible_expenses text,
  application_process text,
  claim_process text,
  typical_frequency text,
  required_documents text[],
  internal_notes text,
  created_at timestamptz not null default now()
);

create table program_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references grant_programs(id) on delete cascade,
  type text not null check (type in (
    'rule','observation','writing_guidance','claim_guidance',
    'budget_guidance','document_requirement','historical_learning'
  )),
  content text not null,
  source text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  validated_by_user boolean not null default false,
  validated_by uuid references organization_users(id),
  created_at timestamptz not null default now()
);
