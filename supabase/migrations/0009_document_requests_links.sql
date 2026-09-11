-- 0009_document_requests_links.sql

create table document_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  claim_id uuid references claims(id) on delete cascade,
  requested_from_contact_id uuid references contacts(id) on delete set null,
  document_type text not null,
  title text not null,
  instructions text,
  due_date date,
  status text not null default 'not_requested' check (status in (
    'not_requested','requested','received','validated','issue','not_required'
  )),
  visible_in_client_portal boolean not null default true,
  requested_at timestamptz,
  received_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade, -- auto-derive, voir trigger
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'expense_invoice','expense_payment_proof','document_request',
    'claim_requirement','claim','grant_agreement','application_answer'
  )),
  entity_id uuid not null,
  relation_type text,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id, relation_type)
);

create or replace function enforce_document_link_integrity()
returns trigger language plpgsql as $$
declare
  v_doc_org uuid;
  v_entity_org uuid;
begin
  select organization_id into v_doc_org from documents where id = new.document_id;
  if v_doc_org is null then
    raise exception 'document_links: document_id % does not exist', new.document_id;
  end if;
  new.organization_id := v_doc_org;

  case new.entity_type
    when 'expense_invoice', 'expense_payment_proof' then
      select organization_id into v_entity_org from expenses where id = new.entity_id;
    when 'document_request' then
      select organization_id into v_entity_org from document_requests where id = new.entity_id;
    when 'claim_requirement' then
      select organization_id into v_entity_org from claim_requirements where id = new.entity_id;
    when 'claim' then
      select organization_id into v_entity_org from claims where id = new.entity_id;
    when 'grant_agreement' then
      select organization_id into v_entity_org from grant_agreements where id = new.entity_id;
    when 'application_answer' then
      select organization_id into v_entity_org from application_answers where id = new.entity_id;
    else
      raise exception 'document_links: unknown entity_type %', new.entity_type;
  end case;

  if v_entity_org is null then
    raise exception 'document_links: entity_id % not found for entity_type %', new.entity_id, new.entity_type;
  end if;

  if v_entity_org <> v_doc_org then
    raise exception 'document_links: document and target entity belong to different organizations';
  end if;

  return new;
end;
$$;

create trigger trg_document_links_integrity
  before insert or update on document_links
  for each row execute function enforce_document_link_integrity();
