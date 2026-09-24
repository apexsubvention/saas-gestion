-- 0048_billing_line_items_supplier_access.sql
--
-- Étend l'accès en lecture de billing_line_items (postes budgétaires/activités acceptés, extraits de
-- la convention -- 0042_billing_aid.sql) aux comptes fournisseurs/sous-traitants (Sitegrow et
-- semblables) reconnus via project_suppliers.supplier_client_id, même mécanisme que 0047 pour
-- project_suppliers/documents : can_access_grant_project_as_supplier(grant_project_id).
--
-- Demandé par Jade : le portail doit aussi montrer "quoi inscrire sur la facture" (nom du module,
-- nombre d'heures, ou tâches/dépenses admissibles) -- déjà extrait par l'IA existante
-- (analyzeConventionActivities.ts) et affiché côté interne (page "Aide à la facturation"), il ne
-- restait qu'à l'exposer en lecture au portail. Politique SELECT additionnelle (permissive, donc
-- combinée en OR avec billing_line_items_select de 0042) -- aucune politique existante modifiée.
create policy "billing_line_items_select_supplier" on billing_line_items
  for select using (can_access_grant_project_as_supplier(grant_project_id));
