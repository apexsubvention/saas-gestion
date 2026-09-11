-- Bootstrap V1 : cree la premiere organisation et rattache le premier admin.
-- A executer UNE FOIS via l'editeur SQL Supabase (contexte postgres, donc RLS non
-- appliquee ici -- c'est le seul endroit ou on contourne volontairement la RLS,
-- pour resoudre le probleme d'amorçage "personne n'a encore de role admin").
--
-- Etapes :
-- 1. Creer le premier utilisateur via Supabase Auth (Dashboard > Authentication > Add user,
--    ou supabase.auth.admin.inviteUserByEmail depuis un script serveur avec la service role key).
-- 2. Copier son UUID (auth.users.id) ci-dessous.
-- 3. Executer ce script.

do $$
declare
  v_org_id uuid;
  v_first_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- <- remplacer par l'UUID reel
begin
  insert into organizations (name) values ('Firme Interne') returning id into v_org_id;

  insert into organization_users (organization_id, user_id, role, full_name, active)
  values (v_org_id, v_first_user_id, 'admin', 'Premier Admin', true);
end $$;
