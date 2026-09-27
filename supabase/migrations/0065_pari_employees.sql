-- Jade : pour le programme PARI CNRC / IRAP, les "fournisseurs" d'un dossier sont en réalité des
-- salariés internes (coûts = heures x taux horaire), et les "factures" sont des DDR (Demandes de
-- remboursement) périodiques -- jusqu'ici Apex forçait à réutiliser le vocabulaire "fournisseur
-- externe" tel quel, ce qui la mélangeait. On ADAPTE le tableau existant (project_suppliers /
-- expenses) plutôt que de construire une section séparée -- décision prise avec Jade.
--
-- is_employee / role : identifie une ligne project_suppliers comme un salarié interne (plutôt
-- qu'un fournisseur externe) et son rôle/titre, indépendant du champ "contact" existant (qui reste
-- utilisable pour un fournisseur externe ordinaire).
alter table project_suppliers add column if not exists is_employee boolean not null default false;
alter table project_suppliers add column if not exists role text;

-- hours / hourly_rate : coût d'un salarié pour UNE période DDR -- s'ajoutent aux montants déjà
-- suivis (subtotal/total/eligible_amount) sans les remplacer ; invoice_number continue de servir
-- de numéro (réutilisé comme "N° DDR" côté UI pour un salarié, exactement comme Jade le fait déjà
-- manuellement aujourd'hui -- ex. "DDR1").
alter table expenses add column if not exists hours numeric;
alter table expenses add column if not exists hourly_rate numeric;

-- Solde restant de l'année financière du programme PARI (0065, Jade : "actualiser le montant
-- restant facilement" après chaque upload d'un rapport Historique DDR) -- pas d'autre source de
-- vérité pour cette valeur dans Apex : mise à jour directement (pas de statut "à vérifier") par la
-- lecture automatique du dernier rapport téléversé, mais reste modifiable à la main à tout moment.
alter table grant_projects add column if not exists pari_balance_remaining numeric;
alter table grant_projects add column if not exists pari_balance_label text;
alter table grant_projects add column if not exists pari_balance_updated_at timestamptz;

-- Nouvelle catégorie de document "ddr_report" (0007_documents.sql avait la liste figée dans une
-- contrainte CHECK) : le rapport officiel "Historique des réclamations" (Historique DDR), lu
-- automatiquement à l'upload -- voir analyzeDdrReport.ts / analyzeUploadedDdrReport (actions.ts).
alter table documents drop constraint if exists documents_category_check;
alter table documents add constraint documents_category_check check (category in (
  'application','agreement','invoice','ddr_report','payment_proof','budget','report',
  'claim_form','annex','proposal','bank_statement',
  'email_attachment','meeting_attachment','other'
));
