-- 0080_budget_lines_claimed.sql
-- Section « Ce qui a été déposé » : coche « Réclamé au programme » par poste de budget, plus la ou
-- les réclamations du dossier dans lesquelles le poste a été réclamé (souvent 2 : un même poste
-- est fréquemment réparti sur deux réclamations).
--
-- claimed_claim_ids : tableau d'identifiants de claims (même dossier) plutôt qu'une table de
-- liaison -- les policies RLS existantes de budget_lines (0016/0068) couvrent déjà la lecture et la
-- modification, rien à ajouter. Pas de clé étrangère possible sur un tableau : une réclamation
-- supprimée laisse un identifiant orphelin, ignoré à l'affichage (filtré contre la liste des
-- réclamations du dossier) et retiré à la prochaine modification du poste.
--
-- "if not exists" : fichier rejouable sans erreur.
alter table budget_lines
  add column if not exists claimed_to_program boolean not null default false,
  add column if not exists claimed_claim_ids uuid[] not null default '{}',
  add column if not exists claimed_by uuid references organization_users(id),
  add column if not exists claimed_at timestamptz;
