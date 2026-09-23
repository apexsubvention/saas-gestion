-- 0043_client_portal_password.sql
--
-- Le mot de passe temporaire d'un compte portail n'était affiché qu'une seule fois à la création
-- (jamais stocké) -- Jade doit pouvoir le reconsulter plus tard pour le retransmettre au client, et
-- pouvoir en générer un nouveau ou supprimer complètement le compte. Conservé en clair par choix
-- assumé (outil interne, accès déjà réservé aux admins par les policies existantes de 0016/0028) --
-- pas une pratique recommandée en général, mais c'est le compromis demandé ici plutôt qu'une
-- régénération à la demande sans stockage.

alter table client_portal_users add column current_password text;
