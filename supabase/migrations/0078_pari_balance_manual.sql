-- 0078_pari_balance_manual.sql
--
-- Jade : pour un dossier PARI CNRC, pouvoir fixer le « Solde restant » à la main, indépendamment
-- des réclamations (rapports Historique DDR lus automatiquement) et des factures. Quand ce drapeau
-- est vrai, la lecture d'un rapport DDR ne remplace plus le solde : seule une modification manuelle
-- (ou « Revenir à l'automatique ») le change. Additif seulement.
alter table grant_projects
  add column if not exists pari_balance_manual boolean not null default false;
