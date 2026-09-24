-- 0050_billing_line_items_included.sql
--
-- Corrige un problème signalé par Jade : l'aide à la facturation (0042) répartissait le montant DE
-- LA SUBVENTION (parfois lu par erreur depuis un tableau « Répartition de la subvention » de la
-- convention) sur les versements, plutôt que le coût réel à facturer. Exemple concret : une
-- formation à 75h x 150 $ = 11 250 $ (Sitegrow, à facturer) + 1 875 $ de salaire interne (payé
-- directement par l'entreprise, remboursé par la subvention SANS facture) -- il faut diviser
-- 11 250 $ sur les versements, pas un montant de subvention, et le salaire interne ne doit jamais
-- être facturé.
--
-- Deux volets :
--  1. Le prompt de lecture de la convention (src/features/billing/analyzeConventionActivities.ts)
--     est corrigé pour viser le COÛT de chaque activité, jamais le montant de l'aide/subvention.
--  2. Chaque ligne peut maintenant être cochée « à facturer » ou non -- Jade choisit explicitement
--     quelles activités (ex. un sous-traitant externe) donnent lieu à une facture, par opposition à
--     un coût interne remboursé directement. Seules les lignes cochées alimentent le total réparti
--     sur les versements.
alter table billing_line_items add column included_in_billing boolean not null default true;

comment on column billing_line_items.included_in_billing is
  'Coché = ce poste donne lieu à une facture du client (inclus dans le total réparti sur les versements). Décoché = coût interne (ex. salaire) remboursé directement par la subvention, jamais facturé.';
