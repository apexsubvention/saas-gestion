-- 0034_grant_project_statuses.sql
--
-- Simplification des statuts d'un dossier de subvention : 11 statuts -> 6.
--
--   draft             À rédiger
--   pending_approval  En attente d'approbation
--   approved          Approuvé
--   awaiting_claim    Approuvé — en attente de réclamation  (posé automatiquement quand l'entente
--                     est saisie et que ses dates de réclamation sont créées, voir la fiche dossier)
--   rejected          Refusé
--   completed         Complété
--
-- Correspondance des données existantes (À RELIRE : la fusion est avec perte) :
--   prospect, qualifying, preparing   -> draft
--   submitted, under_review           -> pending_approval
--   approved, active, final_claim     -> awaiting_claim s'il existe une entente pour le dossier,
--                                        sinon approved
--   completed                         -> completed
--   rejected, cancelled               -> rejected   (« annulé » n'existe plus : traité comme refusé)

alter table grant_projects drop constraint if exists grant_projects_status_check;

update grant_projects gp
set status = case
  when gp.status in ('prospect','qualifying','preparing') then 'draft'
  when gp.status in ('submitted','under_review') then 'pending_approval'
  when gp.status in ('approved','active','final_claim') then
    case when exists (select 1 from grant_agreements ga where ga.grant_project_id = gp.id)
         then 'awaiting_claim' else 'approved' end
  when gp.status = 'completed' then 'completed'
  when gp.status in ('rejected','cancelled') then 'rejected'
  else gp.status
end;

alter table grant_projects
  add constraint grant_projects_status_check
  check (status in ('draft','pending_approval','approved','awaiting_claim','rejected','completed'));

alter table grant_projects alter column status set default 'draft';
