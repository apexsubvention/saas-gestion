-- 0039_questionnaire_delete.sql
--
-- Le personnel peut retirer une question importée par erreur (avant : admins seulement, car aucune policy
-- de suppression n'était ouverte au personnel). La condition d'accès est reprise TELLE QUELLE de la policy
-- SELECT de chaque table (personnel + accès au dossier, cf. 0038) : on ne peut supprimer que ce qu'on peut lire.
-- Migration additive : aucune donnée touchée.

do $$
declare r record;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and policyname in ('application_sections_select', 'application_questions_select', 'application_answers_select')
  loop
    execute format('drop policy if exists %I on public.%I', replace(r.policyname, '_select', '_delete'), r.tablename);
    execute format('create policy %I on public.%I for delete using (%s)', replace(r.policyname, '_select', '_delete'), r.tablename, r.qual);
  end loop;
end $$;
