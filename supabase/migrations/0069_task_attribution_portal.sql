-- 0069_task_attribution_portal.sql
--
-- Jade : pouvoir attribuer une tâche non seulement au client du dossier (comportement actuel,
-- seul cas possible jusqu'ici -- voir createTaskAction), mais aussi à un fournisseur inscrit
-- (project_suppliers.supplier_client_id, même mécanisme que 0047) ou à un client parent/enfant
-- (parent_client_id, 0028) -- et rendre la tâche visible dans LEUR portail respectif (comme
-- « Tâches à faire », document_requests, 0009/0067), avec une case à cocher « Marquer comme
-- fait » côté client/fournisseur.
--
-- Tout est additif, aucun comportement existant ne change :
--   - target_kind : catégorise QUI la tâche concerne, pour l'affichage/le filtre seulement --
--     l'accès réel reste déterminé par client_id/supplier_id ci-dessous, pas par cette
--     étiquette. 'client' reste la valeur par défaut, cohérente avec tout l'historique
--     (client_id déjà toujours rempli avec le client du dossier jusqu'ici).
--   - supplier_id : nouveau, pour cibler un fournisseur inscrit plutôt qu'un client.
--   - visible_in_portal : défaut FALSE -- aucune tâche existante n'apparaît soudainement dans
--     un portail (opt-in explicite par tâche, même principe que
--     document_requests.visible_in_client_portal, 0009).

alter table tasks
  add column if not exists target_kind text not null default 'client'
    check (target_kind in ('client', 'parent_client', 'child_client', 'supplier')),
  add column if not exists supplier_id uuid references project_suppliers(id) on delete set null,
  add column if not exists visible_in_portal boolean not null default false;

create index if not exists idx_tasks_supplier_id on tasks(supplier_id);

-- Lecture portail : le compte du client visé (via client_id, exactement -- pas de cascade
-- parent -> enfant automatique ici, même choix que document_requests_portal_select (0016) :
-- une tâche adressée à un enfant ne doit pas polluer le portail du parent, et vice-versa) ou le
-- compte fournisseur inscrit visé (via supplier_id -> project_suppliers.supplier_client_id,
-- même mécanisme que can_access_grant_project_as_supplier, 0047).
--
-- Pas de policy d'update portail : « marquer comme fait » passe par le service role après
-- vérification d'accès via cette même policy select, exactement comme
-- markDocumentRequestDoneAction (document_requests n'a pas non plus de policy update portail).
drop policy if exists "tasks_portal_select" on tasks;
create policy "tasks_portal_select" on tasks
  for select using (
    visible_in_portal = true
    and (
      (client_id is not null and is_client_portal_user(client_id))
      or (
        supplier_id is not null
        and exists (
          select 1 from project_suppliers ps
          where ps.id = tasks.supplier_id
            and ps.supplier_client_id is not null
            and is_client_portal_user(ps.supplier_client_id)
        )
      )
    )
  );
