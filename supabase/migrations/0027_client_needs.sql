-- 0027_client_needs.sql
-- Section "Besoins" sur la fiche client : le besoin/projet actuel du client, en texte libre,
-- utilisé pour alimenter le moteur de correspondance (features/watch/projectMatch.ts) sans
-- que l'utilisateur ait à retaper la description dans "Parle-moi de ton projet" à chaque fois.

alter table clients
  add column current_needs text,
  add column needs_updated_at timestamptz,
  add column needs_updated_by uuid references organization_users(id);
