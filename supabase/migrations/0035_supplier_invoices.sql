-- 0035_supplier_invoices.sql
--
-- Tableau fournisseurs modifiable d'un dossier : ajouter / modifier / supprimer un fournisseur, lui
-- associer des factures (document téléversé + date + montant) et suivre la subvention restante.
--
-- 1) Supprimer un fournisseur ne doit JAMAIS faire perdre ses factures : expenses.supplier_id et
--    budget_lines.supplier_id passent à ON DELETE SET NULL (la facture reste, « sans fournisseur »).
-- 2) expenses.source : « manual » (saisie) ou « ai » (lue automatiquement sur le document, à vérifier).
-- 3) Suppression ouverte au personnel (admin OU employé) pour project_suppliers, expenses et
--    document_links, sur les dossiers auxquels il a accès : avant, réservée aux admins, ce qui
--    rendait le tableau impossible à corriger pour un employé (le DELETE ne renvoyait simplement rien).

alter table expenses drop constraint if exists expenses_supplier_id_fkey;
alter table expenses
  add constraint expenses_supplier_id_fkey
  foreign key (supplier_id) references project_suppliers(id) on delete set null;

alter table budget_lines drop constraint if exists budget_lines_supplier_id_fkey;
alter table budget_lines
  add constraint budget_lines_supplier_id_fkey
  foreign key (supplier_id) references project_suppliers(id) on delete set null;

alter table expenses
  add column source text not null default 'manual' check (source in ('manual','ai'));

drop policy "project_suppliers_delete" on project_suppliers;
create policy "project_suppliers_delete" on project_suppliers
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

drop policy "expenses_delete" on expenses;
create policy "expenses_delete" on expenses
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

drop policy "document_links_delete" on document_links;
create policy "document_links_delete" on document_links
  for delete using (
    is_org_staff(organization_id)
    and exists (
      select 1 from documents p
      where p.id = document_links.document_id
        and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id))
          or (p.client_id is not null and can_access_client(p.client_id)))
    )
  );
