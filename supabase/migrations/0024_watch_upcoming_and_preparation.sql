-- 0024_watch_upcoming_and_preparation.sql
-- Étape 2C.2 — programmes d'emploi/stages prioritaires + ouvertures à venir + préparation de dossier.

alter table funding_opportunities
  add column if not exists availability_status text not null default 'unknown'
    check (availability_status in ('open','opening_soon','continuous','closed','unknown')),
  add column if not exists expected_open_date date,
  add column if not exists preparation_documents text[] not null default '{}',
  add column if not exists preparation_notes text,
  add column if not exists preparation_source_url text;

create index if not exists idx_funding_opportunities_availability
  on funding_opportunities (organization_id, availability_status, expected_open_date, deadline);

-- Sources supplémentaires orientées main-d'oeuvre et stages.
insert into funding_sources (organization_id,name,base_url,source_family,geographic_level,territory_label,is_official,active,priority,collection_method,health_status,notes)
select o.id, s.name, s.base_url, s.source_family, s.geographic_level, s.territory_label, s.is_official, true, s.priority, s.collection_method, 'never_checked', s.notes
from organizations o
cross join (values
  ('Services Québec — Formation de la main-d’œuvre','https://www.quebec.ca/entreprises-et-travailleurs-autonomes/administrer-gerer/embauche-gestion-personnel/former-main-oeuvre/developper-competences','provincial_ministry','province_territory','Québec',true,1,'scrape','MFOR — formation et développement des compétences.'),
  ('Services Québec — Subvention salariale','https://www.quebec.ca/entreprises-et-travailleurs-autonomes/administrer-gerer/embauche-gestion-personnel/recruter/aider-personne-integrer-emploi-maniere-durable','provincial_ministry','province_territory','Québec',true,1,'scrape','Aide à l’embauche et intégration durable en emploi.'),
  ('ICTC — WIL Digital','https://ictc-ctic.smapply.ca/prog/wil_digital/','funding_intermediary','canada','Canada',false,1,'scrape','Subvention salariale pour stages étudiants en économie numérique.'),
  ('ECO Canada — Stages pratiques pour étudiants','https://eco.ca/fr/etudiants/programme-de-stages-pour-etudiants/','funding_intermediary','canada','Canada',false,1,'scrape','Subvention salariale pour stages étudiants en environnement / STEAM / affaires.'),
  ('Pratiques RH — Accueillez un stagiaire','https://pratiquesrh.com/services/accueillez-un-stagiaire','funding_intermediary','province_territory','Québec',false,1,'scrape','Subvention salariale pour stages au Québec; périodes de dépôt publiées sur la page.'),
  ('TECHNATION — Career Ready','https://careerready.technationcanada.ca/','funding_intermediary','canada','Canada',false,1,'scrape','Programme de stages pratiques pour étudiants — rôles technologiques.' ),
  ('Investissement Québec — PSCE','https://www.investquebec.com/fr/financement/programmes-gouvernementaux/psce','crown_corporation','province_territory','Québec',true,1,'scrape','Programme de soutien à la commercialisation et à l’exportation; préparation de dossier et pièces justificatives.')
) as s(name,base_url,source_family,geographic_level,territory_label,is_official,priority,collection_method,notes)
on conflict (organization_id, base_url) do nothing;
