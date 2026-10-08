-- 0076_portal_activity_handled.sql
--
-- Jade : sur l'onglet Dossiers du portail admin, un résumé de ce que les clients font dans le
-- portail (« Sitegrow a déposé une facture pour le versement 1 de son client enfant Caracol »),
-- pour être plus alerte sur les tâches à faire. Chaque ligne peut être marquée « Traité » pour
-- disparaître de la liste « À traiter ».
--
-- Les activités elles-mêmes existent déjà : dossier_events (source = 'portal', 0036) et les notes
-- écrites par les clients (dossier_notes.author_role = 'client', 0046). Cette table ne fait que
-- retenir lesquelles ont été traitées -- sans jamais modifier le journal (dossier_events reste
-- en ajout seulement) ni les notes.
create table if not exists portal_activity_handled (
  organization_id uuid not null references organizations(id) on delete cascade,
  ref_kind text not null check (ref_kind in ('event', 'note')),
  ref_id uuid not null,
  handled_by uuid references organization_users(id) on delete set null,
  handled_at timestamptz not null default now(),
  primary key (ref_kind, ref_id)
);

alter table portal_activity_handled enable row level security;

create policy "portal_activity_handled_select" on portal_activity_handled
  for select using (is_org_staff(organization_id));
create policy "portal_activity_handled_insert" on portal_activity_handled
  for insert with check (is_org_staff(organization_id));
create policy "portal_activity_handled_delete" on portal_activity_handled
  for delete using (is_org_staff(organization_id));
