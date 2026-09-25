-- 0053_funding_opportunities_portal_access.sql
--
-- Bug trouvé par Jade : le nouvel onglet Veille du portail (0052) n'affiche jamais rien.
-- Cause : 0036_foundation_traceability.sql (section 6, "Durcissement des lectures du rôle client")
-- avait fermé la lecture de funding_opportunities et funding_opportunity_territories au rôle
-- 'client' -- raisonnable à l'époque (aucun usage portail n'existait encore), mais ça bloque
-- maintenant totalement /portal/veille : la requête ne renvoie jamais aucune ligne (RLS filtre
-- silencieusement tout, sans erreur -- d'où « il n'y a jamais de résultats »).
--
-- Policy ADDITIVE (comme 0048/0049 pour la facturation) : le personnel garde son accès complet
-- (0036 inchangée) ; un compte portail actif de la MÊME organisation peut en plus lire ces deux
-- tables -- jamais les autres tables funding_* (sources, collection_runs, awards, changes), qui
-- restent des données de gestion interne réservées au personnel, non lues par le portail.

create or replace function is_org_portal_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from client_portal_users cpu
    where cpu.organization_id = p_organization_id
      and cpu.user_id = auth.uid()
      and cpu.active
  );
$$;

create policy "funding_opportunities_select_portal" on funding_opportunities
  for select using (is_org_portal_member(organization_id));

create policy "funding_opportunity_territories_select_portal" on funding_opportunity_territories
  for select using (is_org_portal_member(organization_id));
