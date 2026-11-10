-- 0081_billing_line_items_claimed.sql
-- Postes de facturation (tableau Fournisseurs et Aide à la facturation) : coche « Réclamé au
-- programme » à côté de « À facturer », plus la ou les réclamations du dossier dans lesquelles le
-- poste a été réclamé (souvent 2).
--
-- Remplace 0080 (même coche sur budget_lines, « Ce qui a été déposé ») : retirée, mauvais tableau.
-- Si 0080 a déjà été exécutée, ses colonnes sur budget_lines restent inutilisées et sans effet.
--
-- claimed_claim_ids : tableau d'identifiants de claims (même dossier) plutôt qu'une table de
-- liaison -- les policies RLS existantes de billing_line_items couvrent déjà lecture et
-- modification. Pas de clé étrangère possible sur un tableau : une réclamation supprimée laisse un
-- identifiant orphelin, ignoré à l'affichage et retiré à la prochaine modification du poste.
-- Rejouable sans erreur ("if not exists").
alter table billing_line_items
  add column if not exists claimed_to_program boolean not null default false,
  add column if not exists claimed_claim_ids uuid[] not null default '{}',
  add column if not exists claimed_by uuid references organization_users(id),
  add column if not exists claimed_at timestamptz;
