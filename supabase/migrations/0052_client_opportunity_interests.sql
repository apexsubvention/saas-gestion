-- 0052_client_opportunity_interests.sql
--
-- Jade a demandé un onglet « Veille » dans le portail client : le client peut chercher/décrire son
-- besoin (même moteur que « Parle-moi de ton projet », src/features/watch/*) parmi le catalogue
-- funding_opportunities -- déjà lisible par un compte portail, voir la note de 0033_client_program_links.sql
-- (« Restent lisibles par tout membre, à durcir séparément : ... funding_* (données de programmes
-- publics) ») -- et signaler son intérêt pour une opportunité. Le personnel en est alerté (notifications).
--
-- Explicitement HORS scope (demandé par Jade) : l'aide à la rédaction (grants/[id]/redaction) n'a
-- aucun lien avec cette table. Explicitement exclu de ce chantier (décision Claude, à valider avec
-- Jade si besoin) : la recherche web approfondie (DeepWebSearch, appels IA payants) et les actions de
-- gestion de la veille (Actualiser, Sources surveillées, Ajouter, changer le statut d'une opportunité)
-- restent réservées au personnel -- le portail est un signal à sens unique, pas un outil de gestion.

create table client_opportunity_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  -- organization_users.id du compte portail qui a envoyé -- toujours renseigné (voir 0028 : chaque
  -- compte portail a une ligne organization_users en plus de sa ligne client_portal_users).
  submitted_by uuid references organization_users(id),
  note text check (note is null or length(note) <= 2000),
  -- new = pas encore vu par le personnel ; viewed = vu ; contacted = le personnel a donné suite ;
  -- dismissed = pas de suite à donner (ex. déjà couvert par un dossier existant).
  status text not null default 'new' check (status in ('new', 'viewed', 'contacted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un client ne signale son intérêt qu'une fois par opportunité -- le bouton du portail devient
  -- "Déjà envoyé" plutôt que de permettre l'envoi en double.
  unique (client_id, opportunity_id)
);

create index idx_client_opportunity_interests_client on client_opportunity_interests(client_id);
create index idx_client_opportunity_interests_org on client_opportunity_interests(organization_id);
create index idx_client_opportunity_interests_opportunity on client_opportunity_interests(opportunity_id);

-- Intégrité : client_id et opportunity_id doivent réellement appartenir à organization_id (même
-- garde-fou que validate_client_program_link() dans 0033 -- SECURITY DEFINER, donc indépendant de ce
-- que le compte courant a le droit de lire).
create or replace function validate_client_opportunity_interest()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_client_org uuid; v_opportunity_org uuid;
begin
  select organization_id into v_client_org from clients where id = new.client_id;
  select organization_id into v_opportunity_org from funding_opportunities where id = new.opportunity_id;
  if v_client_org is null or v_client_org <> new.organization_id then
    raise exception 'client_opportunity_interests: client invalide pour cette organisation';
  end if;
  if v_opportunity_org is null or v_opportunity_org <> new.organization_id then
    raise exception 'client_opportunity_interests: opportunité invalide pour cette organisation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_client_opportunity_interests_integrity
  before insert on client_opportunity_interests
  for each row execute function validate_client_opportunity_interest();

create trigger trg_client_opportunity_interests_org_immutable
  before update on client_opportunity_interests for each row execute function prevent_organization_id_change();

alter table client_opportunity_interests enable row level security;

-- Lecture : le personnel de l'organisation, ou le compte portail du client concerné (pour voir son
-- propre historique d'envois dans /portal/veille).
create policy "client_opportunity_interests_select" on client_opportunity_interests
  for select using (is_org_staff(organization_id) or is_client_portal_user(client_id));

-- Écriture initiale : seulement depuis le portail, pour SON propre client -- jamais le personnel
-- (qui n'a pas besoin de signaler l'intérêt de son propre client à lui-même).
create policy "client_opportunity_interests_insert" on client_opportunity_interests
  for insert with check (
    is_client_portal_user(client_id)
    and submitted_by = current_org_user_id(organization_id)
  );

-- Changement de statut (vu / contacté / classé) : réservé au personnel.
create policy "client_opportunity_interests_update" on client_opportunity_interests
  for update using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy "client_opportunity_interests_delete" on client_opportunity_interests
  for delete using (has_org_role(organization_id, 'admin'));

-- Nouveau type de notification pour alerter le personnel qu'un client a signalé une opportunité.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'deadline','document_missing','invoice_missing','email_waiting',
  'new_prospect','claim_due','budget_warning','client_followup','meeting_task',
  'task_assigned','ai_review','general','opportunity_interest'
));
