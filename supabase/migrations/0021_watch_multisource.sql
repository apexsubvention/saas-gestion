-- 0021_watch_multisource.sql
-- Étape 2B — Veille Canada multi-sources
-- Migration additive uniquement. Ne modifie pas l'historique 0001–0020.

-- -----------------------------------------------------------------------------
-- 1. Registre des sources surveillées
-- -----------------------------------------------------------------------------
create table funding_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  base_url text not null,
  source_family text not null default 'other' check (source_family in (
    'official_federal_aggregator',
    'official_provincial_portal',
    'federal_ministry',
    'federal_regional_agency',
    'provincial_ministry',
    'crown_corporation',
    'funding_intermediary',
    'regional_local_org',
    'municipality',
    'private_aggregator',
    'other'
  )),
  geographic_level text not null default 'other' check (geographic_level in (
    'canada',
    'province_territory',
    'region',
    'mrc_equivalent',
    'municipality',
    'national_specialized',
    'other'
  )),
  territory_label text,
  is_official boolean not null default false,
  active boolean not null default true,
  priority smallint not null default 2 check (priority between 1 and 3),
  collection_method text not null default 'manual' check (collection_method in (
    'manual','api','rss','scrape','email','import','unknown'
  )),
  health_status text not null default 'never_checked' check (health_status in (
    'never_checked','healthy','warning','error','disabled'
  )),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, base_url)
);

create trigger trg_funding_sources_org_immutable
  before update on funding_sources
  for each row execute function prevent_organization_id_change();

-- -----------------------------------------------------------------------------
-- 2. Enrichissement de l'opportunité canonique
-- -----------------------------------------------------------------------------
alter table funding_opportunities
  add column if not exists official_source_id uuid references funding_sources(id) on delete set null,
  add column if not exists official_url text,
  add column if not exists funding_type text check (funding_type is null or funding_type in (
    'grant',
    'contribution',
    'loan',
    'financing',
    'wage_subsidy',
    'internship',
    'call_for_projects',
    'tax_credit',
    'tax_incentive',
    'equity',
    'advisory',
    'other'
  )),
  add column if not exists min_amount numeric(14,2),
  add column if not exists open_date date,
  add column if not exists eligible_sectors text[] not null default '{}',
  add column if not exists eligible_expenses text[] not null default '{}',
  add column if not exists eligibility_criteria text,
  add column if not exists last_verified_at timestamptz;

create or replace function enforce_funding_opportunity_official_source()
returns trigger
language plpgsql
as $$
declare
  v_source_org uuid;
begin
  if new.official_source_id is null then
    return new;
  end if;

  select organization_id into v_source_org
  from funding_sources
  where id = new.official_source_id;

  if v_source_org is null then
    raise exception 'funding_opportunities: official_source_id % does not exist', new.official_source_id;
  end if;

  if v_source_org <> new.organization_id then
    raise exception 'funding_opportunities: official source belongs to a different organization';
  end if;

  return new;
end;
$$;

create trigger trg_funding_opportunity_official_source
  before insert or update of official_source_id, organization_id on funding_opportunities
  for each row execute function enforce_funding_opportunity_official_source();

-- -----------------------------------------------------------------------------
-- 3. Plusieurs sources peuvent détecter la même opportunité canonique
-- -----------------------------------------------------------------------------
create table funding_opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  source_id uuid not null references funding_sources(id) on delete cascade,
  source_url text not null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  match_status text not null default 'confirmed' check (match_status in ('candidate','confirmed','rejected')),
  raw_metadata jsonb,
  created_at timestamptz not null default now(),
  unique (opportunity_id, source_id, source_url)
);

create or replace function set_org_and_validate_funding_opportunity_source()
returns trigger
language plpgsql
as $$
declare
  v_opp_org uuid;
  v_source_org uuid;
begin
  select organization_id into v_opp_org
  from funding_opportunities
  where id = new.opportunity_id;

  if v_opp_org is null then
    raise exception 'funding_opportunity_sources: invalid opportunity_id %', new.opportunity_id;
  end if;

  select organization_id into v_source_org
  from funding_sources
  where id = new.source_id;

  if v_source_org is null then
    raise exception 'funding_opportunity_sources: invalid source_id %', new.source_id;
  end if;

  if v_opp_org <> v_source_org then
    raise exception 'funding_opportunity_sources: opportunity and source belong to different organizations';
  end if;

  new.organization_id := v_opp_org;
  return new;
end;
$$;

create trigger trg_funding_opportunity_sources_integrity
  before insert or update on funding_opportunity_sources
  for each row execute function set_org_and_validate_funding_opportunity_source();

-- -----------------------------------------------------------------------------
-- 4. Géographie hiérarchique exploitable Canada → province → région → MRC → ville
-- Une opportunité peut avoir plusieurs lignes de territoire.
-- -----------------------------------------------------------------------------
create table funding_opportunity_territories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  scope_level text not null check (scope_level in (
    'canada','province_territory','region','mrc_equivalent','municipality'
  )),
  country_code text not null default 'CA',
  province_territory text,
  region text,
  mrc_equivalent text,
  municipality text,
  created_at timestamptz not null default now(),
  check (
    (scope_level = 'canada')
    or (scope_level = 'province_territory' and province_territory is not null)
    or (scope_level = 'region' and province_territory is not null and region is not null)
    or (scope_level = 'mrc_equivalent' and province_territory is not null and mrc_equivalent is not null)
    or (scope_level = 'municipality' and province_territory is not null and municipality is not null)
  )
);

create or replace function set_org_from_funding_opportunity()
returns trigger
language plpgsql
as $$
begin
  select organization_id into new.organization_id
  from funding_opportunities
  where id = new.opportunity_id;

  if new.organization_id is null then
    raise exception '%: invalid opportunity_id %', TG_TABLE_NAME, new.opportunity_id;
  end if;

  return new;
end;
$$;

create trigger trg_funding_opportunity_territories_org
  before insert or update on funding_opportunity_territories
  for each row execute function set_org_from_funding_opportunity();

-- -----------------------------------------------------------------------------
-- 5. Historique des changements détectés sur les programmes
-- Ces lignes représentent des changements observés dans une source, pas des changements
-- de qualification interne comme "Pertinent" / "Ignoré".
-- -----------------------------------------------------------------------------
create table funding_opportunity_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  source_id uuid references funding_sources(id) on delete set null,
  change_type text not null check (change_type in (
    'new_program',
    'reopened',
    'closed',
    'deadline_changed',
    'amount_changed',
    'eligibility_changed',
    'status_changed',
    'other'
  )),
  field_name text,
  old_value jsonb,
  new_value jsonb,
  summary text,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function set_org_and_validate_funding_change()
returns trigger
language plpgsql
as $$
declare
  v_opp_org uuid;
  v_source_org uuid;
begin
  select organization_id into v_opp_org
  from funding_opportunities
  where id = new.opportunity_id;

  if v_opp_org is null then
    raise exception 'funding_opportunity_changes: invalid opportunity_id %', new.opportunity_id;
  end if;

  if new.source_id is not null then
    select organization_id into v_source_org
    from funding_sources
    where id = new.source_id;

    if v_source_org is null then
      raise exception 'funding_opportunity_changes: invalid source_id %', new.source_id;
    end if;

    if v_source_org <> v_opp_org then
      raise exception 'funding_opportunity_changes: opportunity and source belong to different organizations';
    end if;
  end if;

  new.organization_id := v_opp_org;
  return new;
end;
$$;

create trigger trg_funding_opportunity_changes_integrity
  before insert or update on funding_opportunity_changes
  for each row execute function set_org_and_validate_funding_change();

-- -----------------------------------------------------------------------------
-- 6. RLS — 4 policies explicites par nouvelle table, aucune policy FOR ALL
-- -----------------------------------------------------------------------------
alter table funding_sources enable row level security;
create policy "funding_sources_select" on funding_sources
  for select using (is_org_member(organization_id));
create policy "funding_sources_insert" on funding_sources
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_sources_update" on funding_sources
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_sources_delete" on funding_sources
  for delete using (has_org_role(organization_id,'admin'));

alter table funding_opportunity_sources enable row level security;
create policy "funding_opportunity_sources_select" on funding_opportunity_sources
  for select using (is_org_member(organization_id));
create policy "funding_opportunity_sources_insert" on funding_opportunity_sources
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_sources_update" on funding_opportunity_sources
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_sources_delete" on funding_opportunity_sources
  for delete using (has_org_role(organization_id,'admin'));

alter table funding_opportunity_territories enable row level security;
create policy "funding_opportunity_territories_select" on funding_opportunity_territories
  for select using (is_org_member(organization_id));
create policy "funding_opportunity_territories_insert" on funding_opportunity_territories
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_territories_update" on funding_opportunity_territories
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_territories_delete" on funding_opportunity_territories
  for delete using (has_org_role(organization_id,'admin'));

alter table funding_opportunity_changes enable row level security;
create policy "funding_opportunity_changes_select" on funding_opportunity_changes
  for select using (is_org_member(organization_id));
create policy "funding_opportunity_changes_insert" on funding_opportunity_changes
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_changes_update" on funding_opportunity_changes
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_opportunity_changes_delete" on funding_opportunity_changes
  for delete using (has_org_role(organization_id,'admin'));

-- -----------------------------------------------------------------------------
-- 7. Indexes pour filtres, détail et futurs connecteurs
-- -----------------------------------------------------------------------------
create index idx_funding_sources_org_active on funding_sources (organization_id, active);
create index idx_funding_sources_org_family on funding_sources (organization_id, source_family);
create index idx_funding_sources_org_priority on funding_sources (organization_id, priority);

create index idx_funding_opportunities_org_type on funding_opportunities (organization_id, funding_type);
create index idx_funding_opportunities_official_source on funding_opportunities (official_source_id);
create index idx_funding_opportunities_org_verified on funding_opportunities (organization_id, last_verified_at desc);

create index idx_funding_opportunity_sources_opportunity on funding_opportunity_sources (opportunity_id);
create index idx_funding_opportunity_sources_source on funding_opportunity_sources (source_id);
create index idx_funding_opportunity_sources_org_last_detected on funding_opportunity_sources (organization_id, last_detected_at desc);

create index idx_funding_opportunity_territories_opportunity on funding_opportunity_territories (opportunity_id);
create index idx_funding_opportunity_territories_org_province on funding_opportunity_territories (organization_id, province_territory);
create index idx_funding_opportunity_territories_org_region on funding_opportunity_territories (organization_id, region);
create index idx_funding_opportunity_territories_org_mrc on funding_opportunity_territories (organization_id, mrc_equivalent);
create index idx_funding_opportunity_territories_org_municipality on funding_opportunity_territories (organization_id, municipality);

create index idx_funding_opportunity_changes_opportunity_detected on funding_opportunity_changes (opportunity_id, detected_at desc);
create index idx_funding_opportunity_changes_org_detected on funding_opportunity_changes (organization_id, detected_at desc);
