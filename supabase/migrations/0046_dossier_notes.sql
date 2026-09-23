-- 0046_dossier_notes.sql
--
-- Jade a demandé un vrai esprit de collaboration entre les deux portails (interne et
-- client) : pouvoir échanger de courtes notes sur un dossier, et laisser le client
-- déposer un document de sa propre initiative (pas seulement en réponse à une demande
-- précise -- ça, c'est document_requests, qui reste inchangé). Ce fichier couvre la
-- partie « notes » ; le dépôt libre de document réutilise l'upload existant
-- (documents/document storage), voir uploadSharedDocumentAction côté portail -- aucune
-- migration nécessaire pour ça, seulement une nouvelle action serveur.
--
-- Nouvelle table, conçue directement pour les deux côtés (contrairement à
-- documents/document_requests, plus anciennes et réservées au personnel en écriture --
-- cf. le commentaire de uploadRequestedDocumentAction, portal/(app)/actions.ts) : la RLS
-- ci-dessous couvre directement l'écriture depuis le portail, sans passer par le client
-- admin. C'est possible ici parce que chaque compte n'écrit QUE sa propre ligne, jamais
-- une colonne d'une ligne déjà écrite par quelqu'un d'autre (pas de UPDATE du tout,
-- volontairement -- un message ne se réécrit pas, il se supprime et se retape, comme
-- dossier_events).
--
-- author_org_user_id fonctionne pour le personnel ET pour le portail : un compte portail
-- a lui aussi une ligne organization_users (role = 'client', cf. 0001/0028) en plus de sa
-- ligne client_portal_users -- current_org_user_id() s'applique donc aux deux. Il sert
-- uniquement à savoir "est-ce MA note" (bouton Supprimer) -- PAS à afficher l'auteur : la
-- policy organization_users_select (0033) est "is_org_staff OR user_id = auth.uid()", donc
-- un compte portail qui lirait cette table via une jointure imbriquée n'obtiendrait JAMAIS
-- le nom d'un membre du personnel (ni celui d'un autre compte portail, ex. hiérarchie
-- parent/enfant, cf. 0028) -- juste des lignes vides. author_role/author_name sont donc
-- dénormalisés à l'écriture (même principe que dossier_events -- title/detail stockés
-- directement, jamais recalculés par jointure) plutôt que recalculés à la lecture.
--
-- visible_to_client (défaut true) : la note est partagée par défaut -- c'est le but de
-- la fonctionnalité -- mais le personnel peut décocher pour se laisser une note interne
-- sur le même fil plutôt que de rouvrir le journal (dossier_events, réservé au personnel
-- et généré surtout automatiquement). Un compte portail ne peut écrire QUE des notes
-- visibles (il ne peut pas se cacher sa propre note).

create table dossier_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  author_org_user_id uuid not null references organization_users(id) on delete cascade,
  author_role text not null check (author_role in ('staff', 'client')),
  author_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_dossier_notes_project on dossier_notes (grant_project_id, created_at);

alter table dossier_notes enable row level security;

create trigger trg_dossier_notes_org_immutable
  before update on dossier_notes
  for each row execute function prevent_organization_id_change();

-- Lecture : le personnel voit tout (y compris les notes internes) sur les dossiers
-- auxquels il a accès ; le portail ne voit que ce qui lui est explicitement partagé.
create policy "dossier_notes_select_staff" on dossier_notes
  for select using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

create policy "dossier_notes_select_portal" on dossier_notes
  for select using (visible_to_client = true and can_access_grant_project(grant_project_id));

-- Écriture : chacun ne peut écrire que sa propre ligne (author_org_user_id imposé par la
-- policy, pas par le formulaire), sur un dossier auquel il a accès. Le portail ne peut
-- pas se faire passer pour le personnel (is_org_staff exclu explicitement) ni écrire une
-- note cachée à lui-même.
create policy "dossier_notes_insert_staff" on dossier_notes
  for insert with check (
    is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'staff'
  );

create policy "dossier_notes_insert_portal" on dossier_notes
  for insert with check (
    not is_org_staff(organization_id)
    and can_access_grant_project(grant_project_id)
    and visible_to_client = true
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'client'
  );

-- Suppression : l'auteur peut retirer sa propre note (erreur, texte à retaper) ; le
-- personnel peut aussi retirer n'importe quelle note du dossier (modération -- ex. un
-- document/renseignement déposé au mauvais endroit).
create policy "dossier_notes_delete" on dossier_notes
  for delete using (
    (is_org_staff(organization_id) and can_access_grant_project(grant_project_id))
    or (author_org_user_id = current_org_user_id(organization_id) and can_access_grant_project(grant_project_id))
  );
