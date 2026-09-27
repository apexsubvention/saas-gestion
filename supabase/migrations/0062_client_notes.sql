-- 0062_client_notes.sql
--
-- Jade : le fil de notes partagées existant (dossier_notes, 0046) est attaché à UN dossier
-- précis. Elle veut aussi pouvoir noter les petites choses discutées avec un client (en
-- rencontre ou autrement) qui n'ont pas forcément de rapport avec un dossier en particulier --
-- un deuxième fil, cette fois attaché au CLIENT lui-même plutôt qu'à un dossier. Visible et
-- partagé avec le client dans son portail (comme demandé), exactement comme dossier_notes.
--
-- Reprend le design de dossier_notes presque à l'identique (mêmes raisons, voir son
-- commentaire) : author_org_user_id fonctionne pour le personnel ET le portail ; author_role/
-- author_name dénormalisés à l'écriture ; pas d'UPDATE (une note se supprime et se retape) ;
-- can_access_client (hiérarchie-aware, 0028) couvre déjà le cas d'un compte portail parent qui
-- écrit une note sur un client enfant -- aucune logique de hiérarchie supplémentaire ici.

create table client_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  author_org_user_id uuid not null references organization_users(id) on delete cascade,
  author_role text not null check (author_role in ('staff', 'client')),
  author_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_client_notes_client on client_notes (client_id, created_at);

alter table client_notes enable row level security;

create trigger trg_client_notes_org_immutable
  before update on client_notes
  for each row execute function prevent_organization_id_change();

-- Lecture : le personnel voit tout (y compris les notes internes) sur les clients auxquels il a
-- accès ; le portail ne voit que ce qui lui est explicitement partagé.
create policy "client_notes_select_staff" on client_notes
  for select using (is_org_staff(organization_id) and can_access_client(client_id));

create policy "client_notes_select_portal" on client_notes
  for select using (visible_to_client = true and can_access_client(client_id));

-- Écriture : chacun ne peut écrire que sa propre ligne (author_org_user_id imposé par la
-- policy), sur un client auquel il a accès. Le portail ne peut pas se faire passer pour le
-- personnel ni écrire une note cachée à lui-même.
create policy "client_notes_insert_staff" on client_notes
  for insert with check (
    is_org_staff(organization_id)
    and can_access_client(client_id)
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'staff'
  );

create policy "client_notes_insert_portal" on client_notes
  for insert with check (
    not is_org_staff(organization_id)
    and can_access_client(client_id)
    and visible_to_client = true
    and author_org_user_id = current_org_user_id(organization_id)
    and author_role = 'client'
  );

-- Suppression : l'auteur peut retirer sa propre note ; le personnel peut aussi retirer
-- n'importe quelle note du client (modération).
create policy "client_notes_delete" on client_notes
  for delete using (
    (is_org_staff(organization_id) and can_access_client(client_id))
    or (author_org_user_id = current_org_user_id(organization_id) and can_access_client(client_id))
  );
