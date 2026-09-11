-- 0012_funding_meetings.sql

create table funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text,
  external_url text,
  title text,
  organization text,
  summary text,
  eligibility text,
  funding_rate numeric(5,4) check (funding_rate is null or (funding_rate >= 0 and funding_rate <= 1)),
  max_amount numeric(14,2),
  deadline date,
  territory text,
  categories text[],
  raw_content text,
  last_checked_at timestamptz
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  grant_project_id uuid references grant_projects(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  audio_storage_path text,
  audio_retention text not null default 'delete_after_transcription'
    check (audio_retention in ('keep','delete_after_transcription')),
  transcript text,
  created_by uuid references organization_users(id),
  created_at timestamptz not null default now()
);

create table meeting_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  type text not null check (type in (
    'summary','decision','missing_info','task_jade','task_client',
    'document_expected','opportunity','open_question','crm_insight'
  )),
  content text not null,
  status text not null default 'proposed' check (status in ('proposed','accepted','modified','ignored')),
  linked_task_id uuid references tasks(id) on delete set null
);

create or replace function set_org_from_meeting()
returns trigger language plpgsql as $$
begin
  select organization_id into new.organization_id
  from meetings where id = new.meeting_id;
  if new.organization_id is null then
    raise exception 'meeting_insights: invalid meeting_id %', new.meeting_id;
  end if;
  return new;
end $$;

create trigger trg_meeting_insights_org
  before insert or update on meeting_insights
  for each row execute function set_org_from_meeting();
