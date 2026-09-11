-- 0020_funding_opportunities_mvp.sql
-- Champs de qualification nécessaires au MVP de veille.

alter table funding_opportunities
  add column if not exists status text not null default 'new'
    check (status in ('new','to_review','qualified','ignored','archived')),
  add column if not exists relevance_score int
    check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 100)),
  add column if not exists notes text,
  add column if not exists discovered_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_funding_opportunities_org_status
  on funding_opportunities (organization_id, status);

create index if not exists idx_funding_opportunities_org_deadline
  on funding_opportunities (organization_id, deadline);

create index if not exists idx_funding_opportunities_org_discovered
  on funding_opportunities (organization_id, discovered_at desc);
