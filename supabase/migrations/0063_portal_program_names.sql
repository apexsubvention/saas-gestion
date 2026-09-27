-- 0063_portal_program_names.sql
--
-- Bug trouvé suite à la demande de Jade (« on ne voit toujours pas le titre des programmes dans
-- le portail client ») : PortalDossier.programName vient d'une jointure grant_projects(...,
-- grant_programs(name)) -- mais grant_programs_select (0033) ne laisse un compte portail lire un
-- programme QUE s'il lui a été explicitement "envoyé" via la veille (client_program_links,
-- portal_can_see_program) -- jamais parce qu'il a un dossier réel sur ce programme. La jointure
-- PostgREST respecte cette RLS : pour la quasi-totalité des dossiers (créés sans passer par la
-- veille), la ligne grant_programs est invisible et le nom revient simplement null -- pas une
-- erreur, juste silencieusement absent.
--
-- Correction : PAS d'élargissement de grant_programs_select (la table a aussi internal_notes,
-- claim_process, etc. -- des colonnes jamais destinées au client, et Postgres RLS ne filtre
-- qu'au niveau ligne, pas colonne : élargir l'accès à LA LIGNE exposerait TOUTES ses colonnes à
-- une requête directe du portail). Même principe que portal_supplier_dossier_view (0047,
-- projectSuppliers.repository.ts) : une fonction RPC security definer qui vérifie l'accès puis
-- ne renvoie QUE le nom, jamais le reste de la ligne.

create or replace function portal_program_names(p_program_ids uuid[])
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select gpr.id, gpr.name
  from grant_programs gpr
  where gpr.id = any(p_program_ids)
    and exists (
      select 1 from grant_projects gp
      where gp.program_id = gpr.id
        and can_access_grant_project(gp.id)
    );
$$;

grant execute on function portal_program_names(uuid[]) to authenticated;
