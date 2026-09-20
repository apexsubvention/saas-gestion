-- 0032_project_web_searches.sql
--
-- « Parle-moi de ton projet » : quand aucun programme de la veille ne correspond, le SaaS lance
-- une recherche web approfondie (features/watch/webSearch). Le résultat est gardé ici :
--   - pour ne pas relancer (et payer) une recherche identique à chaque affichage de la page ;
--   - pour retrouver les résultats plus tard ;
--   - pour plafonner le nombre de recherches par jour et par organisation (coût).
-- Une ligne par (organisation, texte de projet normalisé) ; une relance remplace la ligne.

create table project_web_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  query_hash text not null,          -- sha256 du texte normalisé
  query_text text not null,
  results jsonb not null default '{}',
  model text,
  created_by uuid references organization_users(id),
  searched_at timestamptz not null default now(),
  unique (organization_id, query_hash)
);
create index idx_project_web_searches_org_date on project_web_searches(organization_id, searched_at desc);

create trigger trg_project_web_searches_org_immutable
  before update on project_web_searches
  for each row execute function prevent_organization_id_change();

-- RLS évaluée sur les colonnes de la ligne elle-même (cf. 0030 : jamais de re-recherche par id).
alter table project_web_searches enable row level security;

create policy "project_web_searches_select" on project_web_searches
  for select using (is_org_member(organization_id));

create policy "project_web_searches_insert" on project_web_searches
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "project_web_searches_update" on project_web_searches
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "project_web_searches_delete" on project_web_searches
  for delete using (has_org_role(organization_id, 'admin'));
