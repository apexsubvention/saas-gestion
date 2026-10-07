-- 0075_portal_access_levels.sql
--
-- Jade : avec plusieurs accès portail par client (0074), chaque personne doit pouvoir avoir un
-- niveau d'accès différent :
--   - 'editor'    « Peut modifier »          : le client lui-même -- téléverser factures et
--                 documents, répondre aux demandes, statut de paiement, notes, etc. (comportement
--                 de tous les comptes existants -- valeur par défaut, rien ne change pour eux) ;
--   - 'commenter' « Consultation + notes »   : voit tout, peut seulement échanger dans les fils
--                 de notes (ex. un comptable externe qui pose des questions) ;
--   - 'viewer'    « Consultation seulement » : voit tout, ne modifie rien (ex. un externe).
--
-- Application côté serveur (src/lib/portal/auth.ts + chaque action portail) ET ici, en RLS, pour
-- les seules tables que le portail écrit directement avec son propre jeton (fils de notes,
-- intérêts pour une opportunité) -- les autres écritures du portail passent déjà par le client
-- admin APRÈS la vérification de l'action serveur.
alter table client_portal_users
  add column if not exists access_level text not null default 'editor'
  check (access_level in ('editor', 'commenter', 'viewer'));

-- Niveau d'accès du compte portail connecté (null pour le personnel / aucun compte actif).
create or replace function portal_access_level()
returns text
language sql stable security definer set search_path = public
as $$
  select access_level from client_portal_users where user_id = auth.uid() and active = true limit 1
$$;

drop policy if exists "dossier_notes_insert_portal" on dossier_notes;
create policy "dossier_notes_insert_portal" on dossier_notes
  for insert with check (
    not is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
    and visible_to_client = true
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'client'
    and portal_access_level() in ('editor', 'commenter')
  );

drop policy if exists "client_notes_insert_portal" on client_notes;
create policy "client_notes_insert_portal" on client_notes
  for insert with check (
    not is_org_staff(organization_id)
    and can_access_client(client_id)
    and visible_to_client = true
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'client'
    and portal_access_level() in ('editor', 'commenter')
  );

drop policy if exists "client_opportunity_interests_insert" on client_opportunity_interests;
create policy "client_opportunity_interests_insert" on client_opportunity_interests
  for insert with check (
    is_client_portal_user(client_id)
    and submitted_by = current_org_user_id(organization_id)
    and portal_access_level() = 'editor'
  );
