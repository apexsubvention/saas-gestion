-- 0071_opportunity_to_confirm_status.sql
--
-- Jade (chantier 2) : nouveau statut de dossier « Opportunité à confirmer », affiché comme
-- colonne du kanban portail À CÔTÉ de « Approuvé — en attente de réclamation ». Quand le
-- personnel pose ce statut (StatusSelect, grants/[id]), le client voit dans son portail :
--   - le résumé du programme (déjà montré pour "draft" -- réutilisé ici tel quel, voir
--     portalDossiers.service.ts / program_snapshots, 0038) ;
--   - un texte libre écrit par le personnel (« angles possibles pour vous », nouvelle colonne
--     ci-dessous -- toujours modifiable, contrairement à un program_snapshots qui est figé/
--     append-only, donc une simple colonne plutôt qu'une nouvelle table) ;
--   - et peut répondre intéressé / ne convient pas (2 colonnes ci-dessous -- un seul dossier =
--     une seule réponse à la fois, toujours modifiable tant que le statut reste
--     "opportunity_to_confirm" -- pas besoin d'une table séparée comme
--     client_opportunity_interests, 0052, qui gère PLUSIEURS opportunités du catalogue de veille
--     par client via une clé composite client+opportunity : pas le même cas d'usage ici, un seul
--     dossier).
-- La réponse du client notifie le personnel -- nouveau type de notification
-- 'opportunity_response', distinct de 'opportunity_interest' (0052, qui concerne le catalogue de
-- veille funding_opportunities, pas un dossier grant_projects réel).

alter table grant_projects drop constraint if exists grant_projects_status_check;
alter table grant_projects
  add constraint grant_projects_status_check
  check (status in ('draft','pending_approval','approved','awaiting_claim','rejected','completed','opportunity_to_confirm'));

alter table grant_projects add column if not exists opportunity_angle_notes text;

alter table grant_projects add column if not exists client_opportunity_response text
  check (client_opportunity_response in ('interested', 'not_interested'));
alter table grant_projects add column if not exists client_opportunity_response_at timestamptz;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'deadline','document_missing','invoice_missing','email_waiting',
  'new_prospect','claim_due','budget_warning','client_followup','meeting_task',
  'task_assigned','ai_review','general','opportunity_interest','invoice_paid','opportunity_response'
));
