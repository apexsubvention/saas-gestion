-- 0045_portal_full_documents.sql
--
-- Jade a demandé un portail client « complet », plus proche de la plateforme admin --
-- en particulier une bibliothèque de documents complète (tous les documents déposés par
-- l'équipe sur les dossiers du client, pas seulement ceux que le client téléverse
-- lui-même via le portail).
--
-- documents_select (0036_foundation_traceability.sql, section 6) restreint aujourd'hui
-- un compte portail à ses seuls documents source = 'client_portal' -- décision délibérée
-- à l'époque ("un compte portail ne lit plus... seulement ses propres téléversements").
-- Jade revient sciemment sur cette restriction ici, en toute connaissance de cause
-- (même pattern que 0044 pour le questionnaire de rédaction) : plutôt que de modifier la
-- policy existante (qui reste intacte pour le personnel), on AJOUTE une policy SELECT
-- permissive supplémentaire, sans condition de "source", donc combinée en OR avec
-- l'existante. Concrètement, un compte portail peut désormais lire tous les documents de
-- son client (et de ses clients enfants, hiérarchie cf. 0028) quel que soit qui les a
-- déposés.
--
-- Ceci ne couvre QUE la table "documents" (les métadonnées) -- le contenu réel du fichier
-- reste dans le bucket de stockage privé, dont la policy portail (0033,
-- "apex_documents_write_portal"/"apex_documents_read") ne couvre qu'un autre chemin
-- (program-links). Voir getPortalDocumentUrlAction (portal/(app)/actions.ts) : l'URL
-- signée est générée avec le client admin après vérification via CETTE policy, même
-- principe que le reste du portail pour les écritures.
--
-- Remarque pour Jade : ceci rend visibles TOUTES les catégories de documents (y compris
-- par ex. "bank_statement" ou les pièces jointes de courriel/réunion) sur ses propres
-- dossiers -- pas seulement les documents "clients" au sens strict. Si certaines
-- catégories doivent rester internes, il faudra le préciser plus tard (filtre applicatif
-- ou policy plus fine).

create policy "documents_select_portal_full" on documents
  for select using (
    (grant_project_id is not null and can_access_grant_project(grant_project_id))
    or (client_id is not null and can_access_client(client_id))
  );
