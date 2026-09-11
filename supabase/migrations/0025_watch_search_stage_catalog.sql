-- 0025_watch_search_stage_catalog.sql
-- Recherche métier robuste + catalogue minimal garanti des programmes de stages prioritaires.
-- Les lignes de catalogue ne prétendent PAS qu'une collecte live a réussi : last_verified_at reste NULL.

alter table funding_opportunities
  add column if not exists search_aliases text[] not null default '{}';

create index if not exists idx_funding_opportunities_search_aliases
  on funding_opportunities using gin (search_aliases);

-- Mots-clés de recherche pour les programmes déjà présents.
update funding_opportunities
set search_aliases = array['stage','stagiaire','stagiaires','étudiant','étudiante','placement étudiant','WIL','work integrated learning','internship','co-op','numérique','technologie']
where canonical_key = 'ictc:wil-digital';

update funding_opportunities
set search_aliases = array['stage','stagiaire','stagiaires','étudiant','étudiante','placement étudiant','WIL','work integrated learning','internship','ECO Canada','environnement','STEAM','affaires']
where canonical_key = 'eco-canada:student-work-placement';

update funding_opportunities
set search_aliases = array['stage','stagiaire','stagiaires','étudiant','étudiante','placement étudiant','WIL','career ready','Career Ready','TECHNATION','technation','technologie','numérique']
where canonical_key = 'technation:career-ready';

update funding_opportunities
set search_aliases = array['stage','stagiaire','stagiaires','étudiant','étudiante','placement étudiant','Pratiques RH','pratique rh','subvention stage','RH']
where canonical_key = 'pratiques-rh:accueillez-un-stagiaire';

update funding_opportunities
set search_aliases = array['formation','MFOR','main-d’œuvre','main oeuvre','compétences','competences','formation employés','formation employes']
where canonical_key = 'services-quebec:mfor';

update funding_opportunities
set search_aliases = array['embauche','emploi','subvention salariale','recrutement','intégration durable','integration durable','employeur']
where canonical_key = 'services-quebec:subvention-salariale-durable';

-- Garantir que les quatre programmes de stages prioritaires sont visibles dans le catalogue
-- même lorsqu'un site externe refuse temporairement le scraping. Le connecteur live les enrichit
-- ensuite et renseigne last_verified_at/last_checked_at lorsqu'il réussit.
with programs as (
  select * from (values
    ('ictc:wil-digital','ICTC — WIL Digital','ICTC / CTIC','https://ictc-ctic.smapply.ca/prog/wil_digital/','Canada','internship',array['Stage','Étudiant','Numérique','Technologie']::text[],array['stage','stagiaire','stagiaires','étudiant','placement étudiant','WIL','work integrated learning','internship','co-op','ICTC','CTIC']::text[],'Programme de stages pratiques en milieu de travail dans l’économie numérique. Vérifier les critères et cohortes sur la source du programme.',5000::numeric),
    ('eco-canada:student-work-placement','ECO Canada — Programme de stages pratiques pour étudiants','ECO Canada','https://eco.ca/fr/etudiants/programme-de-stages-pour-etudiants/','Canada','internship',array['Stage','Étudiant','Environnement','STEAM','Affaires']::text[],array['stage','stagiaire','stagiaires','étudiant','placement étudiant','WIL','work integrated learning','internship','ECO Canada','environnement','STEAM']::text[],'Programme de stages pratiques pour étudiants administré par ECO Canada. Vérifier la cohorte, l’admissibilité et les fonds disponibles sur la source.',5000::numeric),
    ('technation:career-ready','TECHNATION — Career Ready','TECHNATION','https://careerready.technationcanada.ca/','Canada','internship',array['Stage','Étudiant','Technologie','Numérique']::text[],array['stage','stagiaire','stagiaires','étudiant','placement étudiant','WIL','work integrated learning','internship','Career Ready','TECHNATION','technation','technologie','numérique']::text[],'Programme Career Ready de TECHNATION pour des stages étudiants dans des rôles technologiques. Vérifier la cohorte courante et les dates sur la source.',5000::numeric),
    ('pratiques-rh:accueillez-un-stagiaire','Pratiques RH — Accueillez un stagiaire','Pratiques RH','https://pratiquesrh.com/services/accueillez-un-stagiaire','Québec','internship',array['Stage','Étudiant','RH','Québec']::text[],array['stage','stagiaire','stagiaires','étudiant','placement étudiant','Pratiques RH','pratique rh','subvention stage','RH']::text[],'Programme de soutien aux employeurs québécois qui accueillent des stagiaires. Vérifier les périodes de dépôt et les pièces requises sur la source.',5000::numeric)
  ) as p(canonical_key,title,organization,url,territory,funding_type,categories,search_aliases,summary,max_amount)
), inserted as (
  insert into funding_opportunities (
    organization_id, canonical_key, source, external_url, official_source_id, official_url,
    title, organization, summary, territory, funding_type, categories, search_aliases,
    max_amount, target_audience, business_relevance_score, business_relevance_reason,
    status, availability_status, discovered_at, updated_at
  )
  select
    o.id,
    p.canonical_key,
    'Catalogue Apex — programme connu',
    p.url,
    fs.id,
    p.url,
    p.title,
    p.organization,
    p.summary,
    p.territory,
    p.funding_type,
    p.categories,
    p.search_aliases,
    p.max_amount,
    'private_business',
    98,
    'Programme de stage/subvention salariale explicitement destiné aux employeurs.',
    'new',
    'unknown',
    now(),
    now()
  from organizations o
  cross join programs p
  left join funding_sources fs
    on fs.organization_id = o.id and fs.base_url = p.url
  on conflict (organization_id, canonical_key) where canonical_key is not null
  do update set
    search_aliases = excluded.search_aliases,
    categories = excluded.categories,
    summary = coalesce(funding_opportunities.summary, excluded.summary),
    max_amount = coalesce(funding_opportunities.max_amount, excluded.max_amount),
    target_audience = 'private_business',
    business_relevance_score = greatest(funding_opportunities.business_relevance_score, 98),
    updated_at = now()
  returning id, organization_id, canonical_key
)
select count(*) from inserted;

-- Ajouter/compléter les liens source pour les programmes catalogués.
insert into funding_opportunity_sources (organization_id, opportunity_id, source_id, source_url, match_status)
select fo.organization_id, fo.id, fs.id, fo.official_url, 'confirmed'
from funding_opportunities fo
join funding_sources fs
  on fs.organization_id = fo.organization_id and fs.base_url = fo.official_url
where fo.canonical_key in ('ictc:wil-digital','eco-canada:student-work-placement','technation:career-ready','pratiques-rh:accueillez-un-stagiaire')
  and fo.official_url is not null
on conflict (opportunity_id, source_id, source_url) do nothing;

-- Territoires manquants : Canada pour les trois programmes nationaux, Québec pour Pratiques RH.
insert into funding_opportunity_territories (organization_id, opportunity_id, scope_level, province_territory)
select fo.organization_id, fo.id, 'province_territory', 'Québec'
from funding_opportunities fo
where fo.canonical_key = 'pratiques-rh:accueillez-un-stagiaire'
  and not exists (
    select 1 from funding_opportunity_territories t
    where t.opportunity_id = fo.id and t.scope_level='province_territory' and t.province_territory='Québec'
  );

insert into funding_opportunity_territories (organization_id, opportunity_id, scope_level)
select fo.organization_id, fo.id, 'canada'
from funding_opportunities fo
where fo.canonical_key in ('ictc:wil-digital','eco-canada:student-work-placement','technation:career-ready')
  and not exists (
    select 1 from funding_opportunity_territories t
    where t.opportunity_id = fo.id and t.scope_level='canada'
  );
