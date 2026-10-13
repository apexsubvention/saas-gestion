-- 0077_portal_document_invoice_scan.sql
--
-- Jade : les factures déposées par un client dans « Documents » du portail (pas seulement celles
-- reçues sur un versement, 0073) sont maintenant lues automatiquement et ajoutées au tableau
-- Fournisseurs en « à vérifier » -- elles ne comptent dans le Suivi budgétaire et dans le portail
-- client qu'une fois approuvées (« Confirmer »).
--
-- Ces deux colonnes retiennent qu'un document a déjà été lu, pour ne pas relire indéfiniment un
-- document qui n'est pas une facture (talon de paie, attestation...). Additif seulement.
alter table documents
  add column if not exists invoice_scan_at timestamptz,
  add column if not exists invoice_scan_result text check (invoice_scan_result is null or invoice_scan_result in ('invoice', 'not_invoice'));
