-- 0040_schedule_delete.sql
--
-- Migration ADDITIVE (aucune donnée supprimée ni convertie).
--
-- Onglet « Échéanciers & tâches » d'un dossier : on doit pouvoir SUPPRIMER une échéance ou une réclamation.
--
-- 1. milestones / claims : la suppression était réservée aux admins (0016) alors que les tâches (0037)
--    sont supprimables par le personnel : un employé qui clique « Supprimer » ne supprimait silencieusement rien.
--    Désormais : personnel de l'organisation (admin/employé) ayant accès au dossier. Le compte portail
--    (rôle client) ne peut jamais supprimer.
-- 2. schedule_dismissals : mémoire des éléments AUTOMATIQUES supprimés à la main (réclamations mensuelles « DDR »
--    et échéances suggérées à partir de l'entente). Sans elle, réenregistrer l'entente recréerait ce que
--    l'utilisateur vient de supprimer. Les policies sont évaluées sur les colonnes de la ligne (cf. 0030).

-- 1) Suppression ouverte au personnel
drop policy "milestones_delete" on milestones;
create policy "milestones_delete" on milestones
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

drop policy "claims_delete" on claims;
create policy "claims_delete" on claims
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

-- 2) Éléments automatiques supprimés par l'utilisateur
create table schedule_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  kind text not null check (kind in ('claim','milestone')),
  dedupe_key text not null check (length(dedupe_key) between 1 and 300),
  created_at timestamptz not null default now(),
  created_by uuid references organization_users(id) on delete set null,
  unique (grant_project_id, kind, dedupe_key)
);
create index idx_schedule_dismissals_project on schedule_dismissals(grant_project_id, kind);

alter table schedule_dismissals enable row level security;

create policy "schedule_dismissals_select" on schedule_dismissals
  for select using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
create policy "schedule_dismissals_insert" on schedule_dismissals
  for insert with check (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
create policy "schedule_dismissals_delete" on schedule_dismissals
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));
