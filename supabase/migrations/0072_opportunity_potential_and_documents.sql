-- 0072_opportunity_potential_and_documents.sql
--
-- Jade (chantier 2, suite) :
--   1. « potentiel $ qu'on peut aller chercher » + « % de remboursement » -- une estimation du
--      personnel PROPRE à ce dossier/client (distincte du montant max / % générique du
--      programme déjà montré via program_snapshots, 0038/0071) -- 2 nouvelles colonnes sur
--      grant_projects, modifiables en tout temps comme opportunity_angle_notes (0071).
--   2. Les documents déjà téléversés sur ce dossier doivent être visibles au client dans son
--      portail pendant que le statut est "opportunity_to_confirm" -- aucune nouvelle colonne/
--      table nécessaire ici : documents_select_portal_full (0045) donne déjà l'accès, seul le
--      mapping côté portalDossiers.service.ts manquait (voir ce fichier).

alter table grant_projects add column if not exists opportunity_potential_amount numeric(14,2);
alter table grant_projects add column if not exists opportunity_reimbursement_rate numeric(5,4);
