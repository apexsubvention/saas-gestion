-- 0044_portal_drafting_access.sql
--
-- Revient, de façon ciblée et délibérée, sur une partie de la décision prise dans
-- 0038_quick_wins.sql : Jade a explicitement demandé (portail « Mes dossiers ») que le
-- client voie le texte rédigé de son questionnaire de demande (brouillon IA compris),
-- « pour révision » -- ce que 0038 avait justement verrouillé au personnel seulement,
-- en resserrant les policies SELECT de grant_applications / application_sections /
-- application_questions / application_answers avec is_org_staff(...).
--
-- Plutôt que de modifier/annuler la policy staff de 0038 (qui reste intacte -- le
-- personnel garde son accès complet), on AJOUTE une policy SELECT distincte pour ces 4
-- tables, réservée à la lecture, qui suit exactement le même chemin can_access_grant_project
-- que le reste du portail (réclamations, dossier, etc.) -- donc déjà compatible avec la
-- hiérarchie client parent/enfants sans travail supplémentaire. Les policies SELECT de
-- même type se combinent en OR (permissive, comportement par défaut de Postgres) : un
-- compte staff passe par la policy de 0038, un compte portail par celle-ci -- aucune
-- des deux n'a besoin de connaître l'autre. Aucune policy INSERT/UPDATE/DELETE n'est
-- ajoutée pour le rôle client : lecture seule, comme voulu.
--
-- Aucun changement pour tasks/meetings/meeting_insights/emails/activities/opportunities :
-- 0038 les verrouille pour une autre raison (travail interne, non destiné au client) et
-- reste pleinement en vigueur pour ces tables-là.

create policy "grant_applications_select_portal" on grant_applications
  for select using (can_access_grant_project(grant_project_id));

create policy "application_sections_select_portal" on application_sections
  for select using (
    exists (
      select 1 from grant_applications ga
      where ga.id = application_sections.application_id
        and can_access_grant_project(ga.grant_project_id)
    )
  );

create policy "application_questions_select_portal" on application_questions
  for select using (
    exists (
      select 1 from application_sections s
      join grant_applications ga on ga.id = s.application_id
      where s.id = application_questions.section_id
        and can_access_grant_project(ga.grant_project_id)
    )
  );

create policy "application_answers_select_portal" on application_answers
  for select using (
    exists (
      select 1 from application_questions q
      join application_sections s on s.id = q.section_id
      join grant_applications ga on ga.id = s.application_id
      where q.id = application_answers.question_id
        and can_access_grant_project(ga.grant_project_id)
    )
  );
