-- 0007_documents.sql
-- documents = scoping storage/RLS uniquement (client/projet). Les liens fonctionnels
-- vers expenses/claims/etc. passent par document_links (0009).

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size bigint,
  category text not null check (category in (
    'application','agreement','invoice','payment_proof','budget','report',
    'claim_form','annex','proposal','bank_statement',
    'email_attachment','meeting_attachment','other'
  )),
  client_id uuid references clients(id) on delete cascade,
  grant_project_id uuid references grant_projects(id) on delete cascade,
  uploaded_by uuid references organization_users(id),
  source text not null default 'manual' check (source in ('manual','email','meeting','client_portal')),
  created_at timestamptz not null default now()
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  storage_path text not null,
  version_number int not null,
  uploaded_by uuid references organization_users(id),
  created_at timestamptz not null default now()
);

create or replace function set_org_from_document()
returns trigger language plpgsql as $$
begin
  select organization_id into new.organization_id
  from documents where id = new.document_id;
  if new.organization_id is null then
    raise exception 'document_versions: invalid document_id %', new.document_id;
  end if;
  return new;
end $$;

create trigger trg_document_versions_org
  before insert or update on document_versions
  for each row execute function set_org_from_document();
