-- 0036_foundation_traceability.sql
--
-- Phase 1 du cahier d'évolution (docs/ROADMAP_EVOLUTION_APEX.md) : fondation traçabilité / sécurité.
-- Migration ADDITIVE : aucune donnée n'est supprimée ni convertie.
--
--  1. ai_suggestions : toute extraction IA importante est PROPOSÉE (source, page/section, confiance)
--     et n'est appliquée qu'après confirmation. Réutilisée par conventions, réunions, factures, portail.
--  2. Traçabilité des valeurs du tableau fournisseurs : valeur automatique / modification manuelle
--     (jamais détruite : « revenir au calcul automatique » = remettre l'override à NULL) + source.
--  3. Tâches : priorité « urgente » + liens vers une réclamation / un document.
--  4. dossier_events : journal (timeline) d'un dossier.
--  5. audit_logs : le personnel peut écrire (les modifications importantes sont journalisées).
--  6. Durcissement des lectures du rôle client (suite de 0033).

-- ============================================================
-- 1. Suggestions IA (suggestion -> confirmation -> action)
-- ============================================================
create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  source_type text not null check (source_type in ('document','meeting','invoice','web','portal','manual')),
  source_document_id uuid references documents(id) on delete set null,
  source_ref text,                                 -- ex. « page 3 », « section 4.2 »
  kind text not null check (kind in (
    'supplier','agreement_terms','milestone','task','document_request','opportunity','client_fact','program_rule','other'
  )),
  title text not null check (length(title) between 1 and 300),
  payload jsonb not null default '{}',              -- données proposées (validées à l'application)
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  status text not null default 'proposed' check (status in ('proposed','applied','dismissed')),
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references organization_users(id),
  decided_at timestamptz
);
create index idx_ai_suggestions_project on ai_suggestions(grant_project_id, status);
create index idx_ai_suggestions_client on ai_suggestions(client_id, status);

create trigger trg_ai_suggestions_org_immutable
  before update on ai_suggestions for each row execute function prevent_organization_id_change();

alter table ai_suggestions enable row level security;

create policy "ai_suggestions_select" on ai_suggestions
  for select using (is_org_staff(organization_id));
create policy "ai_suggestions_insert" on ai_suggestions
  for insert with check (
    is_org_staff(organization_id)
    and (grant_project_id is null or can_access_grant_project(grant_project_id))
    and (client_id is null or can_access_client(client_id))
  );
create policy "ai_suggestions_update" on ai_suggestions
  for update using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));
create policy "ai_suggestions_delete" on ai_suggestions
  for delete using (has_org_role(organization_id, 'admin'));

-- ============================================================
-- 2. Traçabilité du tableau fournisseurs
-- ============================================================
--   effective = override manuel ?? valeur automatique ?? calcul de repli (selon la colonne)
alter table project_suppliers
  add column accepted_subsidy_auto numeric(14,2),             -- extraite d'un document (ou importée)
  add column accepted_subsidy_override numeric(14,2),         -- saisie manuelle : ne détruit jamais l'auto
  add column accepted_subsidy_override_by uuid references organization_users(id),
  add column accepted_subsidy_override_at timestamptz,
  add column claimed_override numeric(14,2),                  -- « réclamé à ce jour » : auto = claim_expenses
  add column claimed_override_by uuid references organization_users(id),
  add column claimed_override_at timestamptz,
  add column source_kind text check (source_kind in ('manual','ai','convention','import')),
  add column source_document_id uuid references documents(id) on delete set null,
  add column source_ref text,                                 -- page / section du document source
  add column extracted_at timestamptz,
  add column confidence text check (confidence in ('high','medium','low'));

-- ============================================================
-- 3. Tâches : priorité urgente + liens réclamation / document
-- ============================================================
alter table tasks drop constraint if exists tasks_priority_check;
alter table tasks add constraint tasks_priority_check check (priority in ('low','normal','high','urgent'));
alter table tasks
  add column claim_id uuid references claims(id) on delete set null,
  add column document_id uuid references documents(id) on delete set null;

-- ============================================================
-- 4. Journal (timeline) d'un dossier
-- ============================================================
create table dossier_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 60),   -- ex. status_changed, agreement_saved, invoice_added
  title text not null check (length(title) between 1 and 300),
  detail text check (detail is null or length(detail) <= 2000),
  source text not null default 'system' check (source in ('manual','system','ai','portal')),
  ref_type text,
  ref_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references organization_users(id)
);
create index idx_dossier_events_project on dossier_events(grant_project_id, occurred_at desc);

alter table dossier_events enable row level security;
create policy "dossier_events_select" on dossier_events
  for select using (
    is_org_staff(organization_id)
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id))
      or (client_id is not null and can_access_client(client_id)))
  );
create policy "dossier_events_insert" on dossier_events
  for insert with check (
    is_org_staff(organization_id)
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id))
      or (client_id is not null and can_access_client(client_id)))
  );
-- Un événement historique n'est ni modifié ni supprimé (sauf admin).
create policy "dossier_events_delete" on dossier_events
  for delete using (has_org_role(organization_id, 'admin'));

-- ============================================================
-- 5. audit_logs : écriture par le personnel (lecture toujours réservée aux admins)
-- ============================================================
create policy "audit_logs_insert" on audit_logs
  for insert with check (is_org_staff(organization_id) and user_id = current_org_user_id(organization_id));

-- ============================================================
-- 6. Durcissement des lectures du rôle client (suite de 0033)
-- ============================================================
-- Un compte portail ne lit plus les tables internes de veille / rappels ni les documents du
-- personnel : seulement ses propres téléversements (source = 'client_portal').
drop policy "reminder_rules_select" on reminder_rules;
create policy "reminder_rules_select" on reminder_rules for select using (is_org_staff(organization_id));

drop policy "funding_opportunities_select" on funding_opportunities;
create policy "funding_opportunities_select" on funding_opportunities for select using (is_org_staff(organization_id));
drop policy "funding_sources_select" on funding_sources;
create policy "funding_sources_select" on funding_sources for select using (is_org_staff(organization_id));
drop policy "funding_opportunity_sources_select" on funding_opportunity_sources;
create policy "funding_opportunity_sources_select" on funding_opportunity_sources for select using (is_org_staff(organization_id));
drop policy "funding_opportunity_territories_select" on funding_opportunity_territories;
create policy "funding_opportunity_territories_select" on funding_opportunity_territories for select using (is_org_staff(organization_id));
drop policy "funding_opportunity_changes_select" on funding_opportunity_changes;
create policy "funding_opportunity_changes_select" on funding_opportunity_changes for select using (is_org_staff(organization_id));
drop policy "funding_collection_runs_select" on funding_collection_runs;
create policy "funding_collection_runs_select" on funding_collection_runs for select using (is_org_staff(organization_id));
drop policy "funding_awards_select" on funding_awards;
create policy "funding_awards_select" on funding_awards for select using (is_org_staff(organization_id));

drop policy "documents_select" on documents;
create policy "documents_select" on documents
  for select using (
    (grant_project_id is not null and can_access_grant_project(grant_project_id) and (is_org_staff(organization_id) or source = 'client_portal'))
    or (client_id is not null and can_access_client(client_id) and (is_org_staff(organization_id) or source = 'client_portal'))
  );
