-- 0049_billing_installments_supplier_access.sql
--
-- Même extension que 0048, mais pour billing_installments (le calendrier de facturation -- montant
-- et texte de facture déjà répartis par période/réclamation, src/server/services/billingInstallments.service.ts)
-- : les comptes fournisseurs/sous-traitants (Sitegrow et semblables, reconnus via
-- project_suppliers.supplier_client_id) doivent aussi pouvoir le lire, pas seulement les activités
-- de base (billing_line_items). Politique SELECT additionnelle (permissive, combinée en OR avec
-- billing_installments_select de 0042) -- aucune politique existante modifiée.
create policy "billing_installments_select_supplier" on billing_installments
  for select using (can_access_grant_project_as_supplier(grant_project_id));
