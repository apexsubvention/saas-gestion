-- 0074_portal_multiple_accounts.sql
--
-- Jade : un client doit pouvoir avoir PLUSIEURS accès au portail (ex. la propriétaire, sa
-- comptable, un gestionnaire de projet), chacun avec son propre courriel et mot de passe.
--
-- Jusqu'ici client_portal_users imposait unique (client_id) -- « un seul compte portail par
-- client » (0001). Tout le reste fonctionne déjà par PERSONNE et non par client :
--  - la connexion et requirePortalContext() cherchent la ligne par user_id (toujours unique) ;
--  - les droits (can_access_client / can_access_grant_project, 0014/0028) passent par
--    client_portal_users.user_id = auth.uid() et client_access (une ligne par personne) ;
--  - le mot de passe (0043/0051) et la suppression (cascade depuis auth.users) sont par ligne.
-- On retire donc seulement cette contrainte ; unique (user_id) est conservée : une personne
-- (un courriel) n'est rattachée qu'à un seul client -- les accès aux clients enfants passent
-- toujours par la hiérarchie (0028), pas par plusieurs comptes.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'client_portal_users'
      and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
      and con.conkey[1] = (select attnum from pg_attribute where attrelid = rel.oid and attname = 'client_id')
  loop
    execute format('alter table client_portal_users drop constraint %I', c.conname);
  end loop;
end $$;

create index if not exists idx_client_portal_users_client_id on client_portal_users(client_id);
