-- 0073_portal_invoice_auto_review.sql
--
-- Jade : les clients téléversent maintenant leurs factures dans le portail, versement par
-- versement (0054). Apex doit alors remplir AUTOMATIQUEMENT la facture dans le tableau
-- Fournisseurs du dossier (« Activités et postes budgétaires acceptés ») -- numéro de facture,
-- document, date, montant AVANT taxes, sous le bon fournisseur -- pour qu'il ne reste plus qu'à
-- approuver (« Confirmer », statut 'to_review' -> 'compliant', mécanisme déjà existant).
--
-- S'il y a une incohérence (montant différent de celui prévu pour le versement, date hors
-- période, numéro illisible ou déjà utilisé, émetteur inconnu, taxes qui ne s'additionnent
-- pas...), Apex prépare une note, modifiable, que Jade peut envoyer telle quelle dans le fil de
-- notes du dossier (dossier_notes, visible_to_client = true -- 0046) côté portail.
--
-- Colonnes purement additives sur expenses (aucune donnée existante modifiée) :
--  - billing_installment_id : le versement (0042) pour lequel la facture a été reçue -- lien
--    « bonne pièce » entre l'écran Aide à la facturation et le tableau Fournisseurs ;
--  - review_issues : incohérences détectées à la lecture ([{code, message}]), [] = aucune ;
--  - review_note : brouillon de note au client (modifiable avant envoi) ;
--  - review_note_sent_at / review_note_id : traçabilité de l'envoi dans le fil du dossier.
--
-- Aucune RLS supplémentaire : expenses_select/expenses_update (0016) couvrent déjà le personnel ;
-- l'écriture déclenchée depuis le portail passe par le client admin, strictement sur le versement
-- déjà vérifié (même principe que uploadInstallmentInvoiceAction, 0054).
alter table expenses
  add column if not exists billing_installment_id uuid references billing_installments(id) on delete set null,
  add column if not exists review_issues jsonb not null default '[]'::jsonb,
  add column if not exists review_note text,
  add column if not exists review_note_sent_at timestamptz,
  add column if not exists review_note_id uuid references dossier_notes(id) on delete set null;

create index if not exists expenses_billing_installment_id_idx on expenses(billing_installment_id);
