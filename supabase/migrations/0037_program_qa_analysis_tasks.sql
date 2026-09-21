-- 0037_program_qa_analysis_tasks.sql
--
-- Migration ADDITIVE (aucune donnée supprimée ni convertie).
--
-- 1. tasks : suppression ouverte au personnel (avant : admins seulement) -> le tableau de tâches d'un
--    dossier est enfin entièrement modifiable (modifier, réassigner, supprimer).
-- 2. program_questions : historique des questions posées sur un programme (« Pose-moi tes questions »),
--    avec la réponse, ses sources citées et qui l'a posée.
-- 3. project_analyses : historique des analyses « Explique-moi ton projet » d'un dossier
--    (compatibilité explicable, forces, faiblesses, informations/documents manquants, risques).
-- Les policies sont évaluées sur les colonnes de la ligne elle-même (cf. 0030).

-- 1) Tâches
drop policy "tasks_delete" on tasks;
create policy "tasks_delete" on tasks
  for delete using (
    is_org_staff(organization_id)
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id))
      or (client_id is not null and can_access_client(client_id)))
  );

-- 2) Questions sur un programme
create table program_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references grant_programs(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,          -- contexte client éventuel
  question text not null check (length(question) between 1 and 2000),
  answer jsonb not null default '{}',                                -- { segments, sources, ... }
  model text,
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now()
);
create index idx_program_questions_program on program_questions(program_id, created_at desc);

alter table program_questions enable row level security;
create policy "program_questions_select" on program_questions
  for select using (is_org_staff(organization_id));
create policy "program_questions_insert" on program_questions
  for insert with check (is_org_staff(organization_id) and (client_id is null or can_access_client(client_id)));
create policy "program_questions_delete" on program_questions
  for delete using (has_org_role(organization_id, 'admin'));

-- 3) Analyses de projet (aide à la rédaction)
create table project_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  description text not null check (length(description) between 1 and 8000),
  result jsonb not null default '{}',
  score int check (score is null or (score between 0 and 100)),      -- compatibilité estimée, PAS une probabilité
  model text,
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now()
);
create index idx_project_analyses_project on project_analyses(grant_project_id, created_at desc);

alter table project_analyses enable row level security;
create policy "project_analyses_select" on project_analyses
  for select using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
create policy "project_analyses_insert" on project_analyses
  for insert with check (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
create policy "project_analyses_delete" on project_analyses
  for delete using (has_org_role(organization_id, 'admin'));
