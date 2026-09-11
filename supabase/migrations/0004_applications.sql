-- 0004_applications.sql
-- organization_id denormalise + auto-rempli par trigger (Mission 1, ajustements finaux)

create table grant_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grant_project_id uuid not null references grant_projects(id) on delete cascade,
  accepted_reference boolean not null default false,
  status text not null default 'draft' check (status in ('draft','in_progress','submitted')),
  created_at timestamptz not null default now()
);

create table application_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references grant_applications(id) on delete cascade,
  title text not null,
  order_index int not null
);

create or replace function set_org_from_application()
returns trigger language plpgsql as $$
begin
  select organization_id into new.organization_id
  from grant_applications where id = new.application_id;
  if new.organization_id is null then
    raise exception 'application_sections: invalid application_id %', new.application_id;
  end if;
  return new;
end $$;

create trigger trg_application_sections_org
  before insert or update on application_sections
  for each row execute function set_org_from_application();

create table application_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section_id uuid not null references application_sections(id) on delete cascade,
  prompt text not null,
  order_index int not null
);

create or replace function set_org_from_section()
returns trigger language plpgsql as $$
begin
  select organization_id into new.organization_id
  from application_sections where id = new.section_id;
  if new.organization_id is null then
    raise exception 'application_questions: invalid section_id %', new.section_id;
  end if;
  return new;
end $$;

create trigger trg_application_questions_org
  before insert or update on application_questions
  for each row execute function set_org_from_section();

create table application_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  question_id uuid not null references application_questions(id) on delete cascade,
  ai_draft text,
  user_draft text,
  final_text text,
  updated_at timestamptz not null default now()
);

create or replace function set_org_from_question()
returns trigger language plpgsql as $$
begin
  select organization_id into new.organization_id
  from application_questions where id = new.question_id;
  if new.organization_id is null then
    raise exception 'application_answers: invalid question_id %', new.question_id;
  end if;
  return new;
end $$;

create trigger trg_application_answers_org
  before insert or update on application_answers
  for each row execute function set_org_from_question();
