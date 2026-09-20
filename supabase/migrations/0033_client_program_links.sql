-- 0033_client_program_links.sql
--
-- Associer un programme à des clients : le client est notifié (portail + courriel), voit ce qu'il
-- doit préparer (états financiers, budget, ce qu'il souhaite obtenir...), répond et téléverse ses
-- documents depuis son portail ; le personnel voit l'avancement et sait quand commencer le dépôt.
--
-- SÉCURITÉ -- point de départ : un compte portail est un membre de l'organisation avec le rôle
-- 'client' (organization_users) + client_access + client_portal_users. Les policies existantes
-- écrites avec is_org_member() lui ouvrent donc des lectures qu'un client ne devrait pas avoir.
-- Cette migration corrige ce qui touche directement cette fonctionnalité (voir section 1) et
-- écrit toutes les nouvelles policies pour que le portail ne voie QUE les données de son client.
-- Les policies SELECT sont évaluées sur les colonnes de la ligne elle-même (cf. 0030).

-- ============================================================
-- 0. Fonctions utilitaires
-- ============================================================

-- Conversion tolérante : un segment de chemin de stockage qui n'est pas un uuid donne NULL
-- (au lieu de faire échouer toute la requête de listing).
create or replace function safe_uuid(p text)
returns uuid language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Membre du personnel (admin ou employé) actif de l'organisation -- exclut le rôle 'client'.
create or replace function is_org_staff(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select has_org_role(p_organization_id, 'admin') or has_org_role(p_organization_id, 'employee');
$$;

-- ============================================================
-- 1. Correctifs de lecture trop large pour le rôle 'client'
-- ============================================================

-- 0032 : project_web_searches contient le texte des projets décrits par le personnel (donc
-- des besoins d'AUTRES clients) : réservé au personnel.
drop policy "project_web_searches_select" on project_web_searches;
create policy "project_web_searches_select" on project_web_searches
  for select using (is_org_staff(organization_id));

-- organization_users : un compte portail voyait les courriels et rôles de TOUT le personnel et des
-- comptes portail des AUTRES clients. Il ne lit plus que sa propre ligne (le personnel voit tout).
drop policy "organization_users_select" on organization_users;
create policy "organization_users_select" on organization_users
  for select using (is_org_staff(organization_id) or user_id = auth.uid());

-- program_knowledge_items : règles, observations et conseils internes d'Apex sur les programmes.
drop policy "program_knowledge_items_select" on program_knowledge_items;
create policy "program_knowledge_items_select" on program_knowledge_items
  for select using (is_org_staff(organization_id));

-- Restent lisibles par tout membre (rôle client compris), à durcir séparément : organizations,
-- reminder_rules et les tables de veille funding_* (données de programmes publics).

-- ============================================================
-- 2. Tables
-- ============================================================

create table client_program_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  program_id uuid not null references grant_programs(id) on delete cascade,
  message text check (message is null or length(message) <= 3000),   -- mot personnel de l'équipe Apex
  -- draft : associé, pas encore envoyé (invisible au client) ; sent : visible au portail ;
  -- ready : le client a tout préparé, on peut commencer le dépôt ; declined : pas intéressé.
  status text not null default 'draft' check (status in ('draft','sent','ready','declined')),
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references organization_users(id),
  staff_notify_email text,                                            -- qui avertir quand le client répond
  client_seen_at timestamptz,
  client_response text check (client_response in ('interested','declined')),
  client_note text check (client_note is null or length(client_note) <= 3000),
  ready_at timestamptz,
  email_status text not null default 'none' check (email_status in ('none','sent','failed')),
  email_error text,
  emailed_to text[] not null default '{}',
  emailed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (client_id, program_id),
  check ((status = 'draft') = (sent_at is null))
);
create index idx_client_program_links_client on client_program_links(client_id);
create index idx_client_program_links_program on client_program_links(program_id);

create table client_program_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  link_id uuid not null references client_program_links(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,   -- dénormalisé : RLS sans re-lecture
  position int not null default 0,
  kind text not null check (kind in ('document','question')),         -- document = à téléverser ; question = réponse écrite
  label text not null check (length(label) between 1 and 300),
  hint text check (hint is null or length(hint) <= 1000),
  required boolean not null default true,
  client_status text not null default 'todo' check (client_status in ('todo','done','not_applicable')),
  client_answer text check (client_answer is null or length(client_answer) <= 5000),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_client_program_items_link on client_program_items(link_id);

-- Fichier téléversé par le client pour un élément de la liste : ligne documents standard.
alter table documents add column client_program_item_id uuid references client_program_items(id) on delete set null;
create index idx_documents_client_program_item on documents(client_program_item_id);

-- ============================================================
-- 3. Fonctions d'accès du portail (elles lisent d autres tables : jamais la ligne elle-même)
-- ============================================================

create or replace function link_is_sent(p_link_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from client_program_links l where l.id = p_link_id and l.sent_at is not null);
$$;

-- Le compte portail courant peut-il voir ce programme ? (il a été envoyé à son client)
create or replace function portal_can_see_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from client_program_links l
    join client_portal_users cpu on cpu.client_id = l.client_id
    where l.program_id = p_program_id
      and l.sent_at is not null
      and cpu.user_id = auth.uid()
      and cpu.active
  );
$$;

-- L'élément appartient-il bien à CE client, dans CETTE organisation, et son envoi est-il fait ?
create or replace function portal_owns_item(p_item_id uuid, p_client_id uuid, p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from client_program_items i
    join client_program_links l on l.id = i.link_id
    where i.id = p_item_id
      and i.client_id = p_client_id
      and i.organization_id = p_organization_id
      and l.sent_at is not null
  ) and is_client_portal_user(p_client_id);
$$;

-- Chemin de stockage réservé au portail : exactement {organisation}/{client}/program-links/{fichier}
-- avec organisation et client = ceux du compte portail courant.
create or replace function portal_owns_upload_path(p_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from client_portal_users cpu
    where cpu.user_id = auth.uid()
      and cpu.active
      and array_length(string_to_array(p_name, '/'), 1) = 4
      and cpu.organization_id = safe_uuid((string_to_array(p_name, '/'))[1])
      and cpu.client_id = safe_uuid((string_to_array(p_name, '/'))[2])
      and (string_to_array(p_name, '/'))[3] = 'program-links'
  );
$$;

-- ============================================================
-- 4. Intégrité et garde-fous des mises à jour
-- ============================================================

-- Client, programme et organisation de la ligne doivent être cohérents (SECURITY DEFINER : la
-- vérification ne dépend pas de ce que le compte courant a le droit de lire).
create or replace function validate_client_program_link()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_client_org uuid; v_program_org uuid;
begin
  select organization_id into v_client_org from clients where id = new.client_id;
  select organization_id into v_program_org from grant_programs where id = new.program_id;
  if v_client_org is null or v_client_org <> new.organization_id then
    raise exception 'client_program_links: client invalide pour cette organisation';
  end if;
  if v_program_org is null or v_program_org <> new.organization_id then
    raise exception 'client_program_links: programme invalide pour cette organisation';
  end if;
  return new;
end $$;

create trigger trg_client_program_links_integrity
  before insert on client_program_links
  for each row execute function validate_client_program_link();

create or replace function validate_client_program_item()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_link client_program_links%rowtype;
begin
  select * into v_link from client_program_links where id = new.link_id;
  if v_link.id is null or v_link.organization_id <> new.organization_id or v_link.client_id <> new.client_id then
    raise exception 'client_program_items: link_id incohérent avec organization_id / client_id';
  end if;
  return new;
end $$;

create trigger trg_client_program_items_integrity
  before insert on client_program_items
  for each row execute function validate_client_program_item();

create trigger trg_client_program_links_org_immutable
  before update on client_program_links for each row execute function prevent_organization_id_change();
create trigger trg_client_program_items_org_immutable
  before update on client_program_items for each row execute function prevent_organization_id_change();

-- Le portail ne peut modifier que SA réponse. Le personnel modifie librement (sauf client/programme,
-- fixés à la création). Sans JWT (accès direct base / service) : pas de restriction.
create or replace function guard_client_program_link_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.client_id <> old.client_id or new.program_id <> old.program_id then
    raise exception 'client_program_links: client et programme ne peuvent pas changer';
  end if;
  new.updated_at := now();
  if auth.uid() is null or is_org_staff(new.organization_id) then
    return new;
  end if;

  if new.message is distinct from old.message
     or new.sent_at is distinct from old.sent_at
     or new.sent_by is distinct from old.sent_by
     or new.created_by is distinct from old.created_by
     or new.staff_notify_email is distinct from old.staff_notify_email
     or new.email_status is distinct from old.email_status
     or new.email_error is distinct from old.email_error
     or new.emailed_to is distinct from old.emailed_to
     or new.emailed_at is distinct from old.emailed_at then
    raise exception 'client_program_links: modification non autorisée depuis le portail';
  end if;
  if old.status = 'draft' or new.status = 'draft' then
    raise exception 'client_program_links: statut non modifiable depuis le portail';
  end if;
  -- « prêt pour le dépôt » seulement si tous les éléments obligatoires sont traités.
  if new.status = 'ready' and old.status <> 'ready' and exists (
    select 1 from client_program_items i
    where i.link_id = new.id and i.required and i.client_status = 'todo'
  ) then
    raise exception 'client_program_links: des éléments obligatoires ne sont pas encore traités';
  end if;
  return new;
end $$;

create trigger trg_client_program_links_guard
  before update on client_program_links
  for each row execute function guard_client_program_link_update();

create or replace function guard_client_program_item_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.link_id <> old.link_id or new.client_id <> old.client_id then
    raise exception 'client_program_items: rattachement non modifiable';
  end if;
  if auth.uid() is null or is_org_staff(new.organization_id) then
    return new;
  end if;
  if new.kind is distinct from old.kind
     or new.label is distinct from old.label
     or new.hint is distinct from old.hint
     or new.required is distinct from old.required
     or new.position is distinct from old.position then
    raise exception 'client_program_items: seules les réponses du client sont modifiables depuis le portail';
  end if;
  return new;
end $$;

create trigger trg_client_program_items_guard
  before update on client_program_items
  for each row execute function guard_client_program_item_update();

-- ============================================================
-- 5. RLS
-- ============================================================

alter table client_program_links enable row level security;

create policy "client_program_links_select" on client_program_links
  for select using (
    is_org_staff(organization_id)
    or (sent_at is not null and is_client_portal_user(client_id))
  );

create policy "client_program_links_insert" on client_program_links
  for insert with check (is_org_staff(organization_id) and can_access_client(client_id));

create policy "client_program_links_update" on client_program_links
  for update
  using (is_org_staff(organization_id) or (sent_at is not null and is_client_portal_user(client_id)))
  with check (is_org_staff(organization_id) or (sent_at is not null and is_client_portal_user(client_id)));

create policy "client_program_links_delete" on client_program_links
  for delete using (has_org_role(organization_id, 'admin') or (status = 'draft' and is_org_staff(organization_id)));

alter table client_program_items enable row level security;

create policy "client_program_items_select" on client_program_items
  for select using (
    is_org_staff(organization_id)
    or (is_client_portal_user(client_id) and link_is_sent(link_id))
  );

create policy "client_program_items_insert" on client_program_items
  for insert with check (is_org_staff(organization_id) and can_access_client(client_id));

create policy "client_program_items_update" on client_program_items
  for update
  using (is_org_staff(organization_id) or (is_client_portal_user(client_id) and link_is_sent(link_id)))
  with check (is_org_staff(organization_id) or (is_client_portal_user(client_id) and link_is_sent(link_id)));

create policy "client_program_items_delete" on client_program_items
  for delete using (is_org_staff(organization_id));

-- Programmes : le personnel comme avant ; un compte portail SEULEMENT les programmes envoyés à son
-- client (avant : tout membre de l'organisation, y compris les notes internes).
drop policy "grant_programs_select" on grant_programs;
create policy "grant_programs_select" on grant_programs
  for select using (is_org_staff(organization_id) or portal_can_see_program(id));

drop policy "program_funded_examples_select" on program_funded_examples;
create policy "program_funded_examples_select" on program_funded_examples
  for select using (is_org_staff(organization_id) or portal_can_see_program(program_id));

-- Documents : le compte portail peut ajouter UN fichier rattaché à un élément de SA liste, avec
-- un chemin de stockage qui lui est réservé. Il ne peut ni modifier ni supprimer.
create policy "documents_insert_portal" on documents
  for insert with check (
    source = 'client_portal'
    and client_id is not null
    and grant_project_id is null
    and client_program_item_id is not null
    and is_client_portal_user(client_id)
    and uploaded_by = current_org_user_id(organization_id)
    and portal_owns_item(client_program_item_id, client_id, organization_id)
    and portal_owns_upload_path(storage_path)
  );

-- ============================================================
-- 6. Stockage : lecture limitée + écriture du portail dans son dossier
-- ============================================================

-- Avant : tout membre de l'organisation (donc tout compte portail) pouvait lister et lire TOUS les
-- fichiers de tous les clients. Maintenant : le personnel comme avant ; un compte portail
-- seulement {organisation}/{son client}/program-links/*.
drop policy "apex_documents_read" on storage.objects;
create policy "apex_documents_read" on storage.objects
  for select using (
    bucket_id = 'apex-documents'
    and (
      is_org_staff(safe_uuid((storage.foldername(name))[1]))
      or portal_owns_upload_path(name)
    )
  );

create policy "apex_documents_write_portal" on storage.objects
  for insert with check (
    bucket_id = 'apex-documents'
    and portal_owns_upload_path(name)
  );
