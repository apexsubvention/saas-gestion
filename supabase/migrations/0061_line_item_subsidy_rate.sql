-- 0061_line_item_subsidy_rate.sql
--
-- Jade (dossier Caracol/Sitegrow) : une convention peut avoir PLUSIEURS taux d'aide différents
-- selon le type de frais -- ex. « Frais de formation : 10 500$ x 85% = 8 925$ » alors que le taux
-- global du dossier (contribution du MINISTÈRE / total des frais engagés, ex. 62,76%) sert
-- seulement au calcul de la Subvention maximale du PROJET en entier. Le taux global ne doit donc
-- pas être utilisé pour calculer la Subvention acceptée d'UN poste précis quand ce poste a son
-- propre taux, lu dans le détail du calcul de la convention (Annexe A ou équivalent).
--
-- Champ optionnel : vide (null) = utilise le taux du dossier comme avant (comportement historique
-- inchangé pour les conventions à taux unique). Rempli = ce taux précis remplace le taux du dossier
-- pour calculer la part de subvention QUE CE POSTE représente.
alter table billing_line_items
  add column subsidy_rate numeric;

alter table billing_line_items
  add constraint billing_line_items_subsidy_rate_check
  check (subsidy_rate is null or (subsidy_rate >= 0 and subsidy_rate <= 1));

comment on column billing_line_items.subsidy_rate is
  'Taux d''aide spécifique à ce poste (fraction 0-1), ex. 0.85 pour "Frais de formation x 85%". Vide = utilise le taux d''aide du dossier.';
