-- 0031_program_source_and_examples.sql
--
-- Programme ajouté manuellement avec une URL : le SaaS lit la page (features/programs/reader)
-- et renseigne les champs ci-dessous ; les exemples de projets financés vont dans une table
-- dédiée. Les colonnes déjà présentes sur grant_programs (0002) sont réutilisées telles quelles :
--   typical_aid_rate (fraction 0-1 = % remboursé), max_aid_amount, eligible_expenses,
--   ineligible_expenses, application_process, claim_process, required_documents.

alter table grant_programs
  add column source_url text,
  add column open_date date,
  add column deadline date,
  add column filing_notes text,           -- ex. « 3 périodes de dépôt par année », « en continu »
  add column availability_status text not null default 'unknown'
    check (availability_status in ('open','opening_soon','continuous','closed','unknown')),
  add column min_eligible_spend numeric(14,2),
  add column aid_notes text,              -- formule d'aide en clair (taux, plafonds, cumul)
  add column government_priorities text[] not null default '{}',
  add column resource_links jsonb not null default '[]',   -- [{label, url, kind}] guides, formulaires...
  add column source_text text,            -- texte lu (tronqué) : alimente la correspondance
  add column extraction_method text check (extraction_method in ('llm','heuristic')),
  add column last_read_at timestamptz,
  add column read_status text not null default 'never'
    check (read_status in ('never','ok','partial','error')),
  add column read_error text;

create table program_funded_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references grant_programs(id) on delete cascade,
  title text not null,
  recipient_name text,
  description text,
  amount numeric(14,2),
  location text,
  source_url text not null default '',
  source_kind text not null default 'program_page'
    check (source_kind in ('program_page','open_canada','manual')),
  created_at timestamptz not null default now(),
  unique (program_id, source_url, title)
);
create index idx_program_funded_examples_program on program_funded_examples(program_id);

-- Le programme référencé doit appartenir à la même organisation (même garde-fou que
-- funding_awards / 0026).
create or replace function validate_program_example_org()
returns trigger language plpgsql as $$
declare v_org uuid;
begin
  select organization_id into v_org from grant_programs where id = new.program_id;
  if v_org is null then raise exception 'program_funded_examples: invalid program_id %', new.program_id; end if;
  if v_org <> new.organization_id then raise exception 'program_funded_examples: program belongs to another organization'; end if;
  return new;
end $$;

create trigger trg_program_funded_examples_integrity
  before insert or update on program_funded_examples
  for each row execute function validate_program_example_org();
create trigger trg_program_funded_examples_org_immutable
  before update on program_funded_examples
  for each row execute function prevent_organization_id_change();

-- RLS : policies évaluées sur les colonnes de la ligne elle-même (jamais en re-cherchant la
-- ligne par son id) -- voir 0030 : sinon INSERT ... RETURNING échoue en 42501.
alter table program_funded_examples enable row level security;

create policy "program_funded_examples_select" on program_funded_examples
  for select using (is_org_member(organization_id));

create policy "program_funded_examples_insert" on program_funded_examples
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "program_funded_examples_update" on program_funded_examples
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "program_funded_examples_delete" on program_funded_examples
  for delete using (has_org_role(organization_id, 'admin'));
