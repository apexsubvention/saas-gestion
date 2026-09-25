-- 0055_funding_opportunity_changes_portal_access.sql
--
-- Jade : l'onglet Veille du portail client doit fonctionner exactement comme /watch côté admin
-- (mêmes onglets de vue, mêmes filtres), à l'exception des sources -- voir 0053 pour le
-- raisonnement déjà appliqué à funding_opportunities/funding_opportunity_territories.
--
-- L'onglet de vue « Modifiées » (comme sur /watch) a besoin de funding_opportunity_changes
-- (juste opportunity_id + detected_at, pour savoir quelles opportunités ont changé récemment) --
-- contrairement à funding_sources/funding_awards, cette table ne révèle rien de sensible sur
-- d'autres clients ou sur la gestion interne des sources : seulement qu'UNE opportunité déjà
-- visible du portail a été mise à jour. Policy ADDITIVE, même fonction que 0053
-- (is_org_portal_member) -- le personnel garde son accès complet (0036 inchangée).
--
-- funding_sources, funding_opportunity_sources, funding_collection_runs et funding_awards
-- restent volontairement staff-only (gestion interne des sources, et pour funding_awards des
-- données sur d'autres bénéficiaires -- jamais exposées au portail).
create policy "funding_opportunity_changes_select_portal" on funding_opportunity_changes
  for select using (is_org_portal_member(organization_id));
