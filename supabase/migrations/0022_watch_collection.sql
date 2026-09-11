-- 0022_watch_collection.sql
-- Étape 2C — exécution réelle des connecteurs de veille.

alter table funding_opportunities
  add column if not exists canonical_key text,
  add column if not exists source_updated_at timestamptz;

create unique index if not exists uq_funding_opportunities_org_canonical_key
  on funding_opportunities (organization_id, canonical_key)
  where canonical_key is not null;

create table funding_collection_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_id uuid not null references funding_sources(id) on delete cascade,
  status text not null default 'running' check (status in ('running','success','partial','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_org_and_validate_collection_run()
returns trigger language plpgsql as $$
declare v_source_org uuid;
begin
  select organization_id into v_source_org from funding_sources where id = new.source_id;
  if v_source_org is null then raise exception 'funding_collection_runs: invalid source_id %', new.source_id; end if;
  new.organization_id := v_source_org;
  return new;
end $$;

create trigger trg_funding_collection_runs_integrity
  before insert or update of source_id on funding_collection_runs
  for each row execute function set_org_and_validate_collection_run();

alter table funding_collection_runs enable row level security;
create policy "funding_collection_runs_select" on funding_collection_runs
  for select using (is_org_member(organization_id));
create policy "funding_collection_runs_insert" on funding_collection_runs
  for insert with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')));
create policy "funding_collection_runs_update" on funding_collection_runs
  for update using (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')))
  with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')));
create policy "funding_collection_runs_delete" on funding_collection_runs
  for delete using (has_org_role(organization_id,'admin'));

create index idx_funding_collection_runs_org_started on funding_collection_runs (organization_id, started_at desc);
create index idx_funding_collection_runs_source_started on funding_collection_runs (source_id, started_at desc);
