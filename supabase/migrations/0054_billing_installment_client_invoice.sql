-- 0054_billing_installment_client_invoice.sql
--
-- Jade : dans le portail, pour chaque versement de facturation (billing_installments,
-- 0042), le client -- ou un compte parent dans la hiérarchie (can_access_grant_project
-- est déjà hiérarchie-aware, cf. 0028), ou un compte fournisseur (can_access_grant_project_as_supplier,
-- cf. 0047/0049) -- doit pouvoir indiquer que sa facture est faite et la téléverser
-- directement depuis le portail ; le fichier doit ensuite apparaître automatiquement
-- côté admin, sur l'écran Aide à la facturation du dossier.
--
-- Concept DISTINCT de billing_installments.status ('draft'/'submitted', un choix interne
-- à Apex sur l'état de PRÉPARATION du versement, cf. 0042) : "la facture est faite" est
-- déclaré par le CLIENT, pas par Apex, et les deux peuvent diverger (un versement encore
-- "brouillon" côté Apex peut très bien avoir déjà reçu la facture du client, et
-- inversement) -- d'où de nouvelles colonnes plutôt qu'une réutilisation de `status`.
--
-- L'upload lui-même crée un document normal (documents, category='invoice',
-- source='client_portal' -- même mécanique que les autres téléversements portail, voir
-- uploadRequestedDocumentAction), référencé ici pour que l'écran de facturation admin
-- l'affiche automatiquement, versement par versement, sans requête supplémentaire à
-- corréler à la main.
--
-- Aucune policy RLS supplémentaire nécessaire : billing_installments_select (0042, étendue
-- en 0049 pour les fournisseurs) couvre déjà la lecture portail de la ligne à modifier ;
-- l'écriture reste réservée au staff par billing_installments_update (0042) -- la nouvelle
-- action portail suit le même principe que le reste du portail (uploadRequestedDocumentAction) :
-- vérifie l'accès avec le client RLS normal (SELECT), puis écrit (storage + documents +
-- billing_installments) avec le client admin, strictement sur la ligne déjà vérifiée.
alter table billing_installments
  add column client_invoice_document_id uuid references documents(id) on delete set null,
  add column client_invoice_uploaded_at timestamptz,
  add column client_invoice_uploaded_by uuid references organization_users(id) on delete set null;
