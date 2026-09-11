-- 0026_watch_deep_intelligence.sql
-- Lecture approfondie des programmes + fenêtres de dépôt + intensité d'aide
-- + exemples de projets financés / signaux gouvernementaux.

alter table funding_opportunities
  add column if not exists funding_rate_max numeric(5,2),
  add column if not exists min_eligible_spend numeric(14,2),
  add column if not exists private_contribution_min_rate numeric(5,2),
  add column if not exists stacking_limit_rate numeric(5,2),
  add column if not exists intake_start_at timestamptz,
  add column if not exists intake_end_at timestamptz,
  add column if not exists funding_formula text,
  add column if not exists government_priorities text[] not null default '{}',
  add column if not exists assessment_criteria text,
  add column if not exists official_page_updated_at text,
  add column if not exists deep_read_at timestamptz;

alter table funding_opportunities
  add constraint funding_rate_max_percent_check
    check (funding_rate_max is null or (funding_rate_max >= 0 and funding_rate_max <= 100)),
  add constraint private_contribution_min_rate_check
    check (private_contribution_min_rate is null or (private_contribution_min_rate >= 0 and private_contribution_min_rate <= 100)),
  add constraint stacking_limit_rate_check
    check (stacking_limit_rate is null or (stacking_limit_rate >= 0 and stacking_limit_rate <= 100));

create table funding_awards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references funding_opportunities(id) on delete cascade,
  program_name text,
  recipient_name text,
  recipient_type text,
  project_title text,
  description text,
  amount numeric(14,2),
  agreement_start_date date,
  agreement_end_date date,
  location text,
  federal_organization text,
  agreement_number text,
  source_url text not null,
  source_system text not null default 'open_canada',
  raw_content text,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, source_url)
);

create or replace function validate_funding_award_org()
returns trigger language plpgsql as $$
declare v_opp_org uuid;
begin
  if new.opportunity_id is null then return new; end if;
  select organization_id into v_opp_org from funding_opportunities where id = new.opportunity_id;
  if v_opp_org is null then raise exception 'funding_awards: invalid opportunity_id %', new.opportunity_id; end if;
  if v_opp_org <> new.organization_id then raise exception 'funding_awards: opportunity belongs to another organization'; end if;
  return new;
end $$;

create trigger trg_funding_awards_integrity
  before insert or update on funding_awards
  for each row execute function validate_funding_award_org();

alter table funding_awards enable row level security;
create policy "funding_awards_select" on funding_awards
  for select using (is_org_member(organization_id));
create policy "funding_awards_insert" on funding_awards
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_awards_update" on funding_awards
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );
create policy "funding_awards_delete" on funding_awards
  for delete using (has_org_role(organization_id,'admin'));

create index if not exists idx_funding_awards_opportunity
  on funding_awards (opportunity_id, agreement_start_date desc);
create index if not exists idx_funding_awards_program
  on funding_awards (organization_id, program_name, agreement_start_date desc);

-- PSCE volet 2 : corriger/enrichir les données officielles connues pour la fenêtre annoncée.
-- L'ancien enregistrement générique PSCE est archivé si la fiche spécifique existe.
update funding_opportunities
set status = 'archived', updated_at = now()
where canonical_key = 'iq:psce'
  and exists (
    select 1 from funding_opportunities x
    where x.organization_id = funding_opportunities.organization_id
      and x.official_url ilike '%psce-volet-2%'
  );

update funding_opportunities
set
  title = 'PSCE — Volet 2 — Diversification et consolidation sur les marchés hors Québec',
  summary = 'Favoriser la réalisation de projets de diversification et de consolidation de marchés hors Québec.',
  funding_type = 'contribution',
  max_amount = 60000,
  funding_rate_max = 50,
  min_eligible_spend = 50000,
  private_contribution_min_rate = 35,
  stacking_limit_rate = 65,
  intake_start_at = '2026-09-17 12:00:00-04'::timestamptz,
  intake_end_at = '2026-10-01 12:00:00-04'::timestamptz,
  expected_open_date = '2026-09-17'::date,
  open_date = '2026-09-17'::date,
  deadline = '2026-10-01'::date,
  availability_status = 'opening_soon',
  funding_formula = 'Contribution financière non remboursable. Aide maximale de 60 000 $ par entreprise par année. Taux maximal : 50 % des dépenses admissibles pour un premier projet, 40 % pour un deuxième projet. Dépenses admissibles minimales : 50 000 $ pour une première demande, 62 500 $ pour une deuxième, 100 000 $ pour les demandes subséquentes. Apport privé minimal : 35 %. Cumul gouvernemental maximal : 65 %.',
  government_priorities = array['Diversification des exportations','Consolidation de marchés hors Québec','Amérique latine','Asie-Pacifique','Moyen-Orient','Océanie'],
  assessment_criteria = 'Le projet doit démontrer une stratégie crédible de diversification ou de consolidation de marchés hors Québec et respecter les critères du volet en vigueur.',
  official_page_updated_at = '29 juin 2026',
  deep_read_at = now(),
  updated_at = now()
where official_url ilike '%psce-volet-2%'
   or title ilike '%PSCE - Volet 2%';

-- Signaux utiles pour les programmes récurrents lorsque ces fiches existent déjà.
update funding_opportunities
set government_priorities = array['Innovation technologique','Croissance des PME innovantes','Intelligence artificielle','Technologies propres','Cybersécurité','Propriété intellectuelle','Co-innovation internationale','Technologies à double usage / défense'],
    assessment_criteria = coalesce(assessment_criteria, 'Croissance par l’innovation, capacité technique, mérite du projet, retombées au Canada et capacité de l’entreprise à réaliser le projet.'),
    updated_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(organization,'')) ~ '(pari cnrc|nrc irap|industrial research assistance program)';

update funding_opportunities
set government_priorities = array['Diversification des exportations','Nouveaux marchés internationaux','Retombées économiques au Canada','Marchés à forte croissance'],
    assessment_criteria = coalesce(assessment_criteria, 'Capacité de l’entreprise à réussir à l’international, caractère nouveau du marché cible, retombées économiques au Canada et qualité des activités de développement de marché.'),
    funding_rate_max = coalesce(funding_rate_max,50),
    max_amount = coalesce(max_amount,50000),
    updated_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(organization,'')) ~ '(canexport)';

insert into funding_sources (organization_id,name,base_url,source_family,geographic_level,territory_label,is_official,active,priority,collection_method,health_status,notes)
select o.id,
  'Gouvernement ouvert — Subventions et contributions',
  'https://search.open.canada.ca/grants/',
  'official_federal_aggregator',
  'canada',
  'Canada',
  true,
  true,
  1,
  'scrape',
  'never_checked',
  'Bibliothèque officielle de divulgation proactive utilisée par Apex pour repérer des projets déjà financés et des montants réels.'
from organizations o
on conflict (organization_id, base_url) do nothing;
