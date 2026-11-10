-- 0082_expenses_claimed.sql
-- Factures (tableau Fournisseurs et factures) : coche « Réclamé au programme » sur la ligne de
-- chaque facture, plus le ou les numéros de réclamation au programme (1, 2, ... -- souvent 2).
--
-- Numéros simples plutôt qu'un lien vers la table claims : la plupart des dossiers n'ont aucune
-- réclamation saisie dans l'app (ex. Caracol), la coche doit marcher quand même. Le lien existant
-- « Réclamée dans » (claim_expenses, visible seulement quand des réclamations existent) reste
-- inchangé et indépendant.
--
-- Remplace 0081 (même coche sur billing_line_items -- déplacée ici à la demande de Jade). Si 0081
-- a déjà été exécutée, ses colonnes restent inutilisées et sans effet.
-- Les policies RLS existantes d'expenses couvrent déjà la modification. Rejouable sans erreur.
alter table expenses
  add column if not exists claimed_to_program boolean not null default false,
  add column if not exists claim_numbers int[] not null default '{}',
  add column if not exists claimed_by uuid references organization_users(id),
  add column if not exists claimed_at timestamptz;
