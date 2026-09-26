-- 0057_expense_payment_status.sql
--
-- Jade : sur une facture (fournisseur) d'un dossier, ajouter un statut « Envoyée, non payée »
-- / « Payée », modifiable par le personnel ET par le compte portail du client (l'enfant
-- lui-même ET son parent, via la hiérarchie déjà en place -- 0028). Si payée, une preuve de
-- paiement (document) peut être ajoutée -- par le personnel, l'enfant ou le parent.
--
-- Aucun changement de RLS nécessaire :
--  - Lecture : expenses_select / project_suppliers_select / claim_expenses_select (0016) et
--    document_links_select (0016) n'ont JAMAIS eu de restriction "personnel seulement" --
--    seulement can_access_grant_project()/can_access_client(), déjà hiérarchie- et
--    portail-compatibles depuis 0028 (un compte portail obtient une ligne client_access à sa
--    création, cf. clients/[id]/actions.ts). documents_select_portal_full (0045) couvre déjà la
--    lecture du document de preuve. Donc le tableau fournisseurs/factures est déjà LISIBLE par
--    le portail aujourd'hui -- seule l'application ne l'exposait pas encore.
--  - Écriture : expenses_update/document_links_insert exigent has_org_role(admin/employee) --
--    un compte portail (rôle 'client') échoue toujours cette condition, quelle que soit la
--    hiérarchie. Comme pour uploadInstallmentInvoiceAction (0054) et le fil de notes (0046 est
--    l'exception qui écrit en direct) : l'action portail vérifie l'accès avec le client normal
--    (SELECT déjà portail-compatible ci-dessus), puis écrit avec le client admin (service_role),
--    strictement sur l'id déjà vérifié.
--
-- entity_type 'expense_payment_proof' existe déjà dans document_links (0009) et la catégorie
-- 'payment_proof' existe déjà dans documents (0007) -- prévus mais jamais câblés jusqu'ici.
alter table expenses add column payment_status text not null default 'sent_unpaid' check (payment_status in ('sent_unpaid', 'paid'));
alter table expenses add column payment_status_updated_at timestamptz;
alter table expenses add column payment_status_updated_by uuid references organization_users(id) on delete set null;
