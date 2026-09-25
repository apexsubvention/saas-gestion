-- 0056_grant_projects_hidden_from_parent_and_snapshot_portal.sql
--
-- Jade : « des fois j'ai un client enfant que le dossier ne concerne pas le client parent,
-- j'aimerais pouvoir le masquer du client parent ». Nouvelle colonne, filtrée CÔTÉ APPLICATION
-- (portalDossiersService.listDossiers, comme HIDDEN_PROJECT_STATUSES déjà) plutôt que par RLS :
-- can_access_grant_project() (0028) accorde l'accès de la même façon à un compte portail qui
-- consulte EN TANT QUE le client lui-même et à un compte parent qui consulte via la hiérarchie
-- (clients.parent_client_id) -- la RLS ne distingue pas facilement les deux cas. Un filtre
-- applicatif, qui connaît déjà le client du compte portail connecté (requirePortalContext ->
-- ctx.clientId), est beaucoup plus simple et sûr ici : il ne fait que RETIRER des lignes déjà
-- autorisées par la RLS, jamais en ajouter -- le dossier reste entièrement visible au client
-- enfant lui-même et au personnel.
alter table grant_projects add column hidden_from_parent_portal boolean not null default false;

-- Jade : fiche résumé de programme dans le portail client quand un dossier est « à rédiger ».
-- program_snapshots (0038) n'avait jusqu'ici aucune policy portail -- policy ADDITIVE, même
-- fonction que 0053/0055 (is_org_portal_member) + can_access_grant_project (même garde que la
-- policy staff de 0038), le personnel garde son accès complet (policy 0038 inchangée). Un
-- snapshot ne contient que les règles du programme au moment où il a été figé -- rien qui
-- concerne d'autres clients.
create policy "program_snapshots_select_portal" on program_snapshots
  for select using (is_org_portal_member(organization_id) and can_access_grant_project(grant_project_id));
