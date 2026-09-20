-- 0030_fix_select_policy_on_insert_returning.sql
--
-- Symptôme : « new row violates row-level security policy for table "clients" » (42501)
-- à la création manuelle d'un client (et, pour la même raison, d'un dossier de
-- subvention), alors que l'utilisateur est bien admin de l'organisation.
--
-- Cause racine : ce n'est PAS la policy INSERT (is_org_member / has_org_role passent) ni
-- l'organisation ou le rôle. L'app fait `.insert(...).select().single()`, c.-à-d.
-- `INSERT ... RETURNING *`. Pour renvoyer la ligne, PostgreSQL applique aussi la policy
-- SELECT de la table à la NOUVELLE ligne, et l'évalue AVANT que la ligne soit écrite dans
-- la table (même famille d'erreur : "new row violates row-level security policy").
--   - clients_select        = can_access_client(id)
--   - grant_projects_select = can_access_grant_project(id)
-- Ces deux helpers font `select ... from clients / grant_projects where id = <id>` : ils
-- cherchent la ligne par son propre id, qui n'existe pas encore -> false -> 42501.
-- (Le commentaire d'en-tête de 0016 posait déjà la règle « ne jamais re-questionner la
-- ligne par son propre id » pour les WITH CHECK ; elle avait été oubliée pour les
-- policies SELECT, que RETURNING réutilise.)
--
-- Correctif : ces deux policies SELECT évaluent la ligne à partir de SES PROPRES colonnes
-- (organization_id, owner_id, parent_client_id, client_id) au lieu de la re-chercher.
-- Le comportement d'accès est identique pour une ligne existante :
--   - RLS reste activée, aucune policy « true », aucun service_role ;
--   - les fonctions can_access_client / can_access_grant_project ne sont pas modifiées
--     (les autres tables les appellent avec l'id d'un PARENT déjà existant : sans risque).
-- Les autres tables auditées (voir tests) référencent un parent existant, pas leur propre id.

create or replace function can_read_client_row(
  p_id uuid,
  p_organization_id uuid,
  p_owner_id uuid,
  p_parent_client_id uuid
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    (
      is_org_member(p_organization_id)
      and (
        has_org_role(p_organization_id, 'admin')
        or p_owner_id = current_org_user_id(p_organization_id)
        or exists (
          select 1 from client_access ca
          where ca.client_id = p_id
            and ca.user_id = current_org_user_id(p_organization_id)
        )
      )
    )
    -- accès hérité d'un client parent (hiérarchie, cf. 0028) : le parent existe déjà.
    or (p_parent_client_id is not null and can_access_client(p_parent_client_id));
$$;

drop policy "clients_select" on clients;
create policy "clients_select" on clients
  for select using (can_read_client_row(id, organization_id, owner_id, parent_client_id));

drop policy "grant_projects_select" on grant_projects;
create policy "grant_projects_select" on grant_projects
  for select using (can_access_client(client_id));
