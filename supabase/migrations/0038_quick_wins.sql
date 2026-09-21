-- 0038_quick_wins.sql
--
-- Migration ADDITIVE (aucune donnée supprimée ni convertie) pour les « gains rapides » :
--  1. project_suppliers.position : ordre d'affichage des fournisseurs (réordonner).
--  2. claim_expenses : le personnel peut délier une facture d'une réclamation (avant : admins seulement).
--  3. program_snapshots : copie figée des règles du programme à la création d'un dossier (ou à la demande) ;
--     jamais modifiée après coup -> un dossier historique reste cohérent si le programme change.
--  4. notifications : nouveaux types + lien ; le personnel peut notifier un autre membre du PERSONNEL.
--  5. application_answers.ai_meta : sources, confiance et informations manquantes d'une réponse proposée.

-- 1) Ordre des fournisseurs
alter table project_suppliers add column position int not null default 0;

-- 2) Lier / délier une facture d'une réclamation
drop policy "claim_expenses_delete" on claim_expenses;
create policy "claim_expenses_delete" on claim_expenses
  for delete using (
    is_org_staff(organization_id)
    and exists (select 1 from claims p where p.id = claim_expenses.claim_id and can_access_grant_project(p.grant_project_id))
  );

-- 3) Snapshots des règles du programme
create table program_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  program_id uuid references grant_programs(id) on delete set null,
  reason text not null default 'creation' check (reason in ('creation','manual')),
  snapshot jsonb not null,
  taken_at timestamptz not null default now(),
  taken_by uuid references organization_users(id)
);
create index idx_program_snapshots_project on program_snapshots(grant_project_id, taken_at desc);

alter table program_snapshots enable row level security;
create policy "program_snapshots_select" on program_snapshots
  for select using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
create policy "program_snapshots_insert" on program_snapshots
  for insert with check (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
-- Volontairement AUCUNE policy update : un snapshot n'est jamais modifié. Suppression : admin seulement.
create policy "program_snapshots_delete" on program_snapshots
  for delete using (has_org_role(organization_id, 'admin'));

-- 4) Notifications internes
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'deadline','document_missing','invoice_missing','email_waiting',
  'new_prospect','claim_due','budget_warning','client_followup','meeting_task',
  'task_assigned','ai_review','general'
));
alter table notifications add column href text;

-- Le personnel peut créer une notification pour un autre membre du PERSONNEL de la même organisation
-- (jamais pour un compte portail). Lecture / lecture-marquée / suppression : seulement le destinataire (0016).
create policy "notifications_insert_staff" on notifications
  for insert with check (
    is_org_staff(organization_id)
    and exists (
      select 1 from organization_users ou
      where ou.id = notifications.user_id
        and ou.organization_id = notifications.organization_id
        and ou.active
        and ou.role in ('admin','employee')
    )
  );

-- 5) Réponses de questionnaire : métadonnées de la réponse proposée
alter table application_answers add column ai_meta jsonb;

-- 6) Données INTERNES : réservées au personnel
-- Un compte portail a « client_access » sur son client : les policies écrites avec can_access_client /
-- can_access_grant_project lui laissaient lire le questionnaire interne (brouillons IA compris), les tâches,
-- les réunions et leurs transcriptions, les courriels, activités et opportunités de SON dossier.
-- Ces tables ne servent qu'au personnel : on ajoute « is_org_staff » à leur policy SELECT (condition d'origine
-- conservée telle quelle). Les données financières du client (réclamations, factures, fournisseurs, échéances,
-- convention) restent visibles à son portail, comme prévu.
do $$
declare r record;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and policyname in (
        'grant_applications_select', 'application_sections_select', 'application_questions_select', 'application_answers_select',
        'tasks_select', 'meetings_select', 'meeting_insights_select', 'emails_select', 'activities_select', 'opportunities_select'
      )
      and qual !~ 'is_org_staff'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I for select using (is_org_staff(organization_id) and (%s))', r.policyname, r.tablename, r.qual);
  end loop;
end $$;
