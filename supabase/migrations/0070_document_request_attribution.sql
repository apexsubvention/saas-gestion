-- Jade : l'attribution (client du dossier / client parent / client enfant / fournisseur inscrit)
-- qu'on avait mise sur les tâches internes (0069) devait en fait aller sur « Tâches à faire pour
-- le client » (document_requests) -- 0069 est laissée telle quelle (colonnes inutilisées sur
-- tasks, sans risque), et le même schéma est reproduit ici.
--
-- client_id passe nullable : une demande attribuée à un fournisseur n'a pas de client_id (comme
-- pour les tâches, voir 0069) -- le fournisseur est un project_suppliers, pas forcément un client
-- Apex (supplier_id est la référence, supplier_client_id -- s'il existe -- donne l'accès portail).
alter table document_requests
  alter column client_id drop not null,
  add column if not exists target_kind text not null default 'client'
    check (target_kind in ('client', 'parent_client', 'child_client', 'supplier')),
  add column if not exists supplier_id uuid references project_suppliers(id) on delete set null;

create index if not exists idx_document_requests_supplier_id on document_requests(supplier_id);

-- Personnel (interne) : document_requests_select/insert/update ne dépendaient QUE de
-- can_access_client(client_id) -- devenu insuffisant maintenant que client_id peut être vide
-- (cible fournisseur). Même repli que tasks_select/insert/update (0016) : accès via
-- grant_project_id (une demande est toujours rattachée à un dossier) OU client_id.
drop policy if exists "document_requests_select" on document_requests;
create policy "document_requests_select" on document_requests
  for select using (
    (grant_project_id is not null and can_access_grant_project(grant_project_id))
    or (client_id is not null and can_access_client(client_id))
  );

drop policy if exists "document_requests_insert" on document_requests;
create policy "document_requests_insert" on document_requests
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and (
      (grant_project_id is not null and can_access_grant_project(grant_project_id))
      or (client_id is not null and can_access_client(client_id))
    )
  );

drop policy if exists "document_requests_update" on document_requests;
create policy "document_requests_update" on document_requests
  for update
  using (
    (grant_project_id is not null and can_access_grant_project(grant_project_id))
    or (client_id is not null and can_access_client(client_id))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and (
      (grant_project_id is not null and can_access_grant_project(grant_project_id))
      or (client_id is not null and can_access_client(client_id))
    )
  );

-- Portail : même principe que tasks_portal_select (0069) -- cible EXACTE (is_client_portal_user,
-- jamais can_access_client qui cascaderait automatiquement parent -> enfant), + le cas
-- fournisseur inscrit (project_suppliers.supplier_client_id).
drop policy if exists "document_requests_portal_select" on document_requests;
create policy "document_requests_portal_select" on document_requests
  for select using (
    visible_in_client_portal = true
    and (
      (client_id is not null and is_client_portal_user(client_id))
      or (
        supplier_id is not null
        and exists (
          select 1 from project_suppliers ps
          where ps.id = document_requests.supplier_id
            and ps.supplier_client_id is not null
            and is_client_portal_user(ps.supplier_client_id)
        )
      )
    )
  );
