-- 0067_document_request_optional_upload.sql
--
-- Jade : « Documents demandés au client » devient « Tâches à faire pour le client » -- pas
-- toutes les tâches demandées au client nécessitent un document à téléverser (ex. « signer et
-- retourner la convention » côté portail se fait par un clic, pas un fichier). Nouvelle colonne
-- requires_upload -- défaut true pour que toutes les demandes déjà créées gardent exactement
-- leur comportement actuel (téléversement obligatoire), rien ne change pour l'existant.
alter table document_requests
  add column requires_upload boolean not null default true;
