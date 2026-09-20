-- 0028_client_hierarchy_and_portal_access.sql
--
-- Contexte : Sitegrow est un client d'Apex qui gère lui-même des clients finaux pour
-- lesquels des demandes de subvention sont préparées ; il faut aussi coordonner avec
-- Sitegrow les factures qu'il doit émettre à ses propres clients pour justifier les
-- dépenses admissibles. Deux besoins :
--   1) une hiérarchie client parent / clients enfants (Sitegrow -> ses clients finaux) ;
--   2) que l'accès portail accordé sur un client parent s'applique automatiquement à
--      tous ses enfants, sans avoir à accorder client_access ligne par ligne.

alter table clients add column parent_client_id uuid references clients(id) on delete set null;
alter table clients add constraint clients_parent_not_self check (parent_client_id is null or parent_client_id <> id);
create index idx_clients_parent_client_id on clients(parent_client_id);

-- Permet de rattacher un fournisseur (project_suppliers) à un client Apex existant
-- quand ce fournisseur EST lui-même un de nos clients (ex. Sitegrow comme fournisseur
-- sur le dossier d'un de ses propres clients finaux) -- plus fiable qu'un simple
-- rapprochement par nom texte pour savoir quoi afficher dans le portail de ce client.
alter table project_suppliers add column supplier_client_id uuid references clients(id) on delete set null;
create index idx_project_suppliers_supplier_client_id on project_suppliers(supplier_client_id);

-- can_access_client devient "hiérarchie-aware" : un accès accordé sur un client PARENT
-- (via client_access ou owner_id, ou simplement le rôle admin) s'applique aussi à tous
-- ses descendants -- c'est ce qui permet à un compte portail créé sur Sitegrow de voir
-- automatiquement les dossiers de ses clients enfants, sans policy RLS supplémentaire
-- sur les autres tables (elles passent toutes par can_access_client/can_access_grant_project).
-- Profondeur plafonnée à 10 niveaux par sécurité contre une donnée corrompue (cycle) --
-- la contrainte ci-dessus n'empêche qu'un client d'être son propre parent direct, pas un
-- cycle plus long créé par erreur.
-- Un utilisateur portail doit pouvoir lire SA PROPRE ligne client_portal_users pour que
-- l'app sache à quel client il correspond (requirePortalContext()) -- la policy existante
-- (0016) ne permettait cette lecture qu'aux admins. Ajoutée en policy PERMISSIVE distincte
-- (les deux s'additionnent en OR) plutôt que réécrite, pour ne pas toucher au comportement
-- déjà en place côté staff.
create policy "client_portal_users_select_self" on client_portal_users
  for select using (user_id = auth.uid());

create or replace function can_access_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive ancestry as (
    select id, organization_id, owner_id, parent_client_id, 0 as depth
    from clients where id = p_client_id
    union all
    select c.id, c.organization_id, c.owner_id, c.parent_client_id, a.depth + 1
    from clients c
    join ancestry a on c.id = a.parent_client_id
    where a.depth < 10
  )
  select exists (
    select 1 from ancestry a
    where is_org_member(a.organization_id)
      and (
        has_org_role(a.organization_id, 'admin')
        or a.owner_id = current_org_user_id(a.organization_id)
        or exists (
          select 1 from client_access ca
          where ca.client_id = a.id
            and ca.user_id = current_org_user_id(a.organization_id)
        )
      )
  );
$$;
