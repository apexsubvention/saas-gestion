-- 0023_watch_business_focus.sql
-- Étape 2C.1 — veille orientée entreprises + registre de sources PME prioritaires.

alter table funding_opportunities
  add column if not exists target_audience text not null default 'unknown'
    check (target_audience in ('private_business','mixed','nonprofit','municipality','individual','public_body','unknown')),
  add column if not exists business_relevance_score smallint not null default 50
    check (business_relevance_score between 0 and 100),
  add column if not exists business_relevance_reason text,
  add column if not exists audience_classified_at timestamptz;

-- Backfill prudent : on masque surtout le bruit évident sans supprimer les lignes.
update funding_opportunities
set target_audience = 'nonprofit', business_relevance_score = 10,
    business_relevance_reason = 'Titre ou résumé orienté organisme communautaire / OBNL.',
    audience_classified_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(corporation de développement communautaire|organisme communautaire|lutte contre la pauvreté|action communautaire|organismes communautaires|obnl)';

update funding_opportunities
set target_audience = 'municipality', business_relevance_score = 10,
    business_relevance_reason = 'Programme principalement destiné aux municipalités ou organismes municipaux.',
    audience_classified_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(municipalit|mrc |municipal|infrastructure municipale)'
  and target_audience = 'unknown';

update funding_opportunities
set target_audience = 'individual', business_relevance_score = 5,
    business_relevance_reason = 'Programme principalement destiné aux particuliers.',
    audience_classified_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(particulier|citoyen|personnes à faible revenu|ménage)'
  and target_audience = 'unknown';

update funding_opportunities
set target_audience = 'private_business', business_relevance_score = 85,
    business_relevance_reason = 'Libellé explicitement orienté entreprise / PME / employeur.',
    audience_classified_at = now()
where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(entreprise|pme|employeur|productivit|export|innovation|commercialisation|transformation numérique|technolog|investissement)'
  and target_audience = 'unknown';

-- Sources prioritaires : on les enregistre pour toutes les organisations existantes.
-- Elles ne sont PAS marquées comme collectées tant qu'un vrai connecteur n'a pas tourné.
insert into funding_sources (organization_id,name,base_url,source_family,geographic_level,territory_label,is_official,active,priority,collection_method,health_status,notes)
select o.id, s.name, s.base_url, s.source_family, s.geographic_level, s.territory_label, s.is_official, true, s.priority, s.collection_method, 'never_checked', s.notes
from organizations o
cross join (values
  ('Investissement Québec','https://www.investquebec.com/fr/financement/programmes-gouvernementaux','crown_corporation','province_territory','Québec',true,1,'scrape','Source officielle prioritaire pour les programmes administrés par Investissement Québec.'),
  ('Innovation Canada — Business Benefits Finder','https://innovation.ised-isde.canada.ca/s/?language=fr_CA','official_federal_aggregator','canada','Canada',true,1,'unknown','Agrégateur officiel pancanadien. Connecteur dédié à développer.'),
  ('Développement économique Canada pour les régions du Québec','https://dec.canada.ca/fr/financement/','federal_regional_agency','province_territory','Québec',true,1,'unknown','Source officielle fédérale régionale.'),
  ('PARI CNRC / NRC IRAP','https://nrc.canada.ca/fr/soutien-linnovation-technologique','federal_ministry','canada','Canada',true,1,'unknown','Innovation, R-D et croissance technologique.'),
  ('Services Québec — Entreprises','https://www.quebec.ca/emploi/entreprises','provincial_ministry','province_territory','Québec',true,1,'unknown','Formation, emploi et main-d’œuvre.'),
  ('MEIE — Québec','https://www.economie.gouv.qc.ca/','provincial_ministry','province_territory','Québec',true,1,'unknown','Économie, innovation et énergie.'),
  ('helloDarwin — Subventions et financement','https://hellodarwin.com/fr/aide-aux-entreprises/subventions-et-financement','private_aggregator','canada','Canada',false,2,'unknown','Source secondaire de découverte; toujours valider sur la source officielle.'),
  ('Fundica','https://visa.fundica.ca/home/fr','private_aggregator','canada','Canada',false,2,'unknown','Agrégateur / moteur de financement pour entreprises.'),
  ('Mitacs','https://www.mitacs.ca/fr-ca/nos-programmes/','funding_intermediary','canada','Canada',false,1,'unknown','Stages et projets de recherche collaborative.'),
  ('TECHNATION Career Ready','https://technationcanada.ca/fr/career-ready-program/','funding_intermediary','canada','Canada',false,1,'unknown','Subventions salariales pour stages étudiants.'),
  ('ECO Canada','https://eco.ca/fr/ressources-pour-lemploi/subventions-salariales-et-financement/','funding_intermediary','canada','Canada',false,1,'unknown','Subventions salariales et financement environnement.'),
  ('BioTalent Canada','https://www.biotalent.ca/fr/programmes-de-subvention-salariale/','funding_intermediary','canada','Canada',false,1,'unknown','Subventions salariales bioéconomie.'),
  ('BDC','https://www.bdc.ca/fr/financement','crown_corporation','canada','Canada',true,2,'unknown','Financement d’entreprises.'),
  ('EDC','https://www.edc.ca/fr/solutions.html','crown_corporation','canada','Canada',true,2,'unknown','Exportation et développement international.'),
  ('Réseau des SADC et CAE','https://www.sadc-cae.ca/fr/','regional_local_org','canada','Canada',false,1,'unknown','Financement et accompagnement régional.' )
) as s(name,base_url,source_family,geographic_level,territory_label,is_official,priority,collection_method,notes)
on conflict (organization_id, base_url) do nothing;

create index if not exists idx_funding_opportunities_business_view
  on funding_opportunities (organization_id, target_audience, business_relevance_score desc, discovered_at desc);
