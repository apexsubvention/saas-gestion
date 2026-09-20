-- 0029_schedule_priority.sql
--
-- Contexte : l'échéancier devient un vrai tableau de travail priorisé (vues Priorités
-- et Kanban) qui doit pouvoir représenter la fin de la période d'admissibilité des
-- dépenses comme une échéance à part entière, distincte de la fin de projet
-- ('project_end' existe déjà). Sans cette valeur, suggestMilestonesFromAgreement()
-- n'a aucun type dédié pour ça et devrait détourner 'other', moins lisible dans
-- l'échéancier.

alter table milestones drop constraint milestones_type_check;
alter table milestones add constraint milestones_type_check check (type in (
  'claim','report','document','invoice','payment_proof',
  'project_end','eligibility_end','client_followup','supplier_followup','other'
));
