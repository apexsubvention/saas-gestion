-- 0051_portal_password_change.sql
--
-- Jade a demandé qu'un compte portail puisse changer son mot de passe temporaire à la première
-- connexion. must_change_password indique qu'un changement est suggéré (jamais bloquant -- le
-- client peut « Plus tard » et continuer à utiliser le portail, voir portalSignIn) : vrai à la
-- création d'un compte ou après régénération d'un mot de passe temporaire par Jade, remis à faux
-- dès que le client choisit lui-même son mot de passe.
--
-- Comptes déjà actifs à cette migration : pas de changement forcé qu'ils n'ont pas demandé --
-- backfill à false juste après l'ajout de la colonne.
alter table client_portal_users add column must_change_password boolean not null default true;
update client_portal_users set must_change_password = false;
