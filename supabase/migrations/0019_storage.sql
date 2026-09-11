-- 0019_storage.sql
-- Bucket prive unique. Chemin convention : {organization_id}/{client_id}/{filename}
-- Aucun acces public direct -- toujours via signed URL generee cote serveur (voir
-- server/services/documents.service.ts), apres verification RLS applicative.

insert into storage.buckets (id, name, public)
values ('apex-documents', 'apex-documents', false)
on conflict (id) do nothing;

-- Le premier segment du chemin doit correspondre a une organisation dont
-- l'utilisateur est membre actif -- meme logique que is_org_member(), reecrite
-- ici car storage.objects n'a pas de colonne organization_id native.
create policy "apex_documents_read" on storage.objects
  for select using (
    bucket_id = 'apex-documents'
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

create policy "apex_documents_write" on storage.objects
  for insert with check (
    bucket_id = 'apex-documents'
    and is_org_member((storage.foldername(name))[1]::uuid)
    and (has_org_role((storage.foldername(name))[1]::uuid, 'admin')
      or has_org_role((storage.foldername(name))[1]::uuid, 'employee'))
  );

create policy "apex_documents_delete" on storage.objects
  for delete using (
    bucket_id = 'apex-documents'
    and has_org_role((storage.foldername(name))[1]::uuid, 'admin')
  );
