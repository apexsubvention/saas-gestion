-- 0011_gmail_emails.sql

create table gmail_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connected_user_id uuid references organization_users(id),
  gmail_email text not null,
  access_token_ref text,
  refresh_token_ref text,
  status text not null default 'active' check (status in ('active','revoked','error')),
  created_at timestamptz not null default now()
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  gmail_connection_id uuid not null references gmail_connections(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_email text,
  to_emails text[],
  cc_emails text[],
  subject text,
  snippet text,
  body text,
  received_at timestamptz,
  client_id uuid references clients(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  grant_project_id uuid references grant_projects(id) on delete set null,
  classification text check (classification in (
    'new_prospect','client_question','document_received','invoice_received',
    'payment_proof_received','grant_agency','approval','rejection',
    'follow_up','information','other'
  )),
  requires_action boolean not null default false,
  created_at timestamptz not null default now(),
  unique (gmail_connection_id, gmail_message_id)
);
