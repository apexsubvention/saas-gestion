-- 0047_portal_supplier_dossier_access.sql
--
-- Jade a demandé que les comptes portail qui sont fournisseurs/sous-traitants sur le
-- dossier d'UN AUTRE client (ex. Sitegrow facture pour ses propres clients finaux --
-- cf. project_suppliers.supplier_client_id, 0028) voient beaucoup plus que la ligne de
-- facturation actuelle : le budget total du dossier, la portion de subvention, et TOUS
-- les documents du dossier. Décisions confirmées avec Jade :
--   - Les AUTRES fournisseurs sur le même dossier : total agrégé seulement (montant +
--     nombre), jamais leur identité ni leur détail -- sensibilité concurrentielle.
--   - Documents : accès complet, comme un client habituel du portail.
--   - Activation : automatique pour tout fournisseur ayant un compte portail (pas de
--     case à cocher par dossier) -- dès qu'une ligne project_suppliers le relie à un
--     dossier, l'accès s'applique.
--
-- Constat en creusant le sujet : project_suppliers_select (0016) est
-- "can_access_grant_project(grant_project_id)" -- donc un fournisseur qui n'a PAS accès
-- au dossier par ailleurs (pas de hiérarchie, pas client_access) ne voit même pas SA
-- PROPRE ligne aujourd'hui : listBySupplierClient() (page d'accueil portail,
-- "Facturation à préparer") ne retournait donc déjà rien pour ce cas, malgré le
-- commentaire du code qui décrit précisément ce scénario comme le cas d'usage visé. Ce
-- correctif comble ce trou en plus d'ajouter la nouvelle visibilité étendue.

-- Un compte peut accéder à CE dossier en tant que fournisseur listé dessus (indépendant
-- de can_access_grant_project -- ni hiérarchie ni client_access sur le client final).
create or replace function can_access_grant_project_as_supplier(p_grant_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from project_suppliers ps
    where ps.grant_project_id = p_grant_project_id
      and ps.supplier_client_id is not null
      and can_access_client(ps.supplier_client_id)
  );
$$;

-- project_suppliers : chacun voit SA PROPRE ligne fournisseur, sur n'importe quel
-- dossier (pas seulement ceux déjà accessibles par ailleurs) -- jamais les lignes des
-- AUTRES fournisseurs du même dossier (policy permissive additionnelle, s'ajoute en OR à
-- project_suppliers_select existante ; ne retire rien au personnel).
create policy "project_suppliers_select_own_supplier_row" on project_suppliers
  for select using (supplier_client_id is not null and can_access_client(supplier_client_id));

-- Documents : accès complet (toute source, toute catégorie) sur un dossier où le compte
-- est fournisseur -- même principe que documents_select_portal_full (0045), policy
-- additionnelle distincte pour ne pas mélanger les deux justifications d'accès.
create policy "documents_select_portal_supplier" on documents
  for select using (grant_project_id is not null and can_access_grant_project_as_supplier(grant_project_id));

-- Vue agrégée pour un fournisseur : budget/portion subvention du dossier, sa propre ligne
-- de facturation, et un total AGRÉGÉ des autres fournisseurs (jamais leur détail). Une
-- seule fonction plutôt que d'ouvrir des policies SELECT sur grant_projects/clients/
-- grant_programs/grant_agreements pour les fournisseurs (qui exposeraient alors CES
-- lignes en entier à n'importe quelle requête directe, pas seulement les champs voulus
-- ici) -- SECURITY DEFINER avec vérification d'accès explicite au tout début.
create or replace function portal_supplier_dossier_view(p_grant_project_id uuid)
returns table (
  grant_project_id uuid,
  grant_project_name text,
  status text,
  client_name text,
  program_name text,
  official_start_date date,
  official_end_date date,
  total_project_cost numeric,
  approved_grant_amount numeric,
  grant_rate numeric,
  own_supplier_id uuid,
  own_budget_amount numeric,
  own_billing_frequency text,
  own_expected_invoice_day int,
  own_invoice_description_requirements text,
  other_suppliers_count int,
  other_suppliers_total numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_own_supplier_client_id uuid;
begin
  if not can_access_grant_project_as_supplier(p_grant_project_id) then
    return; -- aucune ligne : accès refusé, pas d'exception (plus simple à gérer côté appelant)
  end if;

  select ps.supplier_client_id into v_own_supplier_client_id
  from project_suppliers ps
  where ps.grant_project_id = p_grant_project_id
    and ps.supplier_client_id is not null
    and can_access_client(ps.supplier_client_id)
  limit 1;

  return query
    select
      gp.id,
      gp.name,
      gp.status,
      c.name,
      prog.name,
      gp.official_start_date,
      gp.official_end_date,
      gp.total_project_cost,
      gp.approved_grant_amount,
      gp.grant_rate,
      own.id,
      own.budget_amount,
      own.billing_frequency,
      own.expected_invoice_day,
      own.invoice_description_requirements,
      (
        select count(*)::int from project_suppliers other
        where other.grant_project_id = p_grant_project_id
          and other.supplier_client_id is not null
          and other.supplier_client_id is distinct from v_own_supplier_client_id
      ),
      (
        select coalesce(sum(other.budget_amount), 0) from project_suppliers other
        where other.grant_project_id = p_grant_project_id
          and other.supplier_client_id is not null
          and other.supplier_client_id is distinct from v_own_supplier_client_id
      )
    from grant_projects gp
    join clients c on c.id = gp.client_id
    join grant_programs prog on prog.id = gp.program_id
    left join project_suppliers own
      on own.grant_project_id = gp.id and own.supplier_client_id = v_own_supplier_client_id
    where gp.id = p_grant_project_id;
end;
$$;

grant execute on function can_access_grant_project_as_supplier(uuid) to authenticated;
grant execute on function portal_supplier_dossier_view(uuid) to authenticated;
