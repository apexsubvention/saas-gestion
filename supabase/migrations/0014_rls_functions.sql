-- ============================================================
-- 0014_rls_functions.sql
-- Fonctions RLS reutilisables (voir Mission 1)
-- ============================================================

create or replace function is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organization_users ou
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.active = true
  );
$$;

create or replace function has_org_role(p_organization_id uuid, p_role org_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organization_users ou
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.active = true
      and ou.role = p_role
  );
$$;

-- LIMIT 1 est sur ici : unique(organization_id, user_id) garantit au plus une ligne.
create or replace function current_org_user_id(p_organization_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select ou.id from organization_users ou
  where ou.organization_id = p_organization_id
    and ou.user_id = auth.uid()
    and ou.active = true
  limit 1;
$$;

create or replace function can_access_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from clients c
    where c.id = p_client_id
      and is_org_member(c.organization_id)
      and (
        has_org_role(c.organization_id, 'admin')
        or c.owner_id = current_org_user_id(c.organization_id)
        or exists (
          select 1 from client_access ca
          where ca.client_id = c.id
            and ca.user_id = current_org_user_id(c.organization_id)
        )
      )
  );
$$;

create or replace function can_access_grant_project(p_grant_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from grant_projects gp
    where gp.id = p_grant_project_id
      and can_access_client(gp.client_id)
  );
$$;

create or replace function is_client_portal_user(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from client_portal_users cpu
    where cpu.client_id = p_client_id
      and cpu.user_id = auth.uid()
      and cpu.active = true
  );
$$;
