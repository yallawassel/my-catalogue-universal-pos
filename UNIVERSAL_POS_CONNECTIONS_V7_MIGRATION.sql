-- My Catalogue Universal POS — connection profiles (v7)
-- Additive migration for the My Catalogue Supabase project ONLY.
-- Does not connect to any POS, store credentials, change products, or activate stock.

create table if not exists public.mc_saas_pos_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  pos_name text not null,
  connection_method text not null check (connection_method in ('file','api','local_agent','custom')),
  connection_status text not null default 'setup_required'
    check (connection_status in ('setup_required','ready','paused','error')),
  sync_frequency text not null default 'manual'
    check (sync_frequency in ('manual','15_minutes','hourly','daily')),
  compatibility_answers jsonb not null default '{}'::jsonb,
  safe_profile jsonb not null default '{}'::jsonb,
  setup_notes text not null default '',
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mc_saas_pos_connections_business_created
  on public.mc_saas_pos_connections(business_id, created_at desc);

alter table public.mc_saas_pos_connections enable row level security;

drop policy if exists mc_saas_pos_connections_manage on public.mc_saas_pos_connections;
create policy mc_saas_pos_connections_manage
  on public.mc_saas_pos_connections
  for all to authenticated
  using (public.mc_saas_can_manage(business_id))
  with check (public.mc_saas_can_manage(business_id));

grant select, insert, update, delete on public.mc_saas_pos_connections to authenticated;
revoke all on public.mc_saas_pos_connections from anon;

-- Link future sync jobs to the saved connection profile, without changing existing jobs.
alter table public.mc_saas_sync_jobs
  add column if not exists connection_id uuid
  references public.mc_saas_pos_connections(id) on delete set null;

create index if not exists mc_saas_sync_jobs_connection_started
  on public.mc_saas_sync_jobs(connection_id, started_at desc)
  where connection_id is not null;

-- Extend the existing source list for future adapter jobs. No connector becomes active here.
alter table public.mc_saas_sync_jobs
  drop constraint if exists mc_saas_sync_jobs_source_type_check;
alter table public.mc_saas_sync_jobs
  add constraint mc_saas_sync_jobs_source_type_check
  check (source_type in ('file','api','local_agent','custom','manual')) not valid;
alter table public.mc_saas_sync_jobs
  validate constraint mc_saas_sync_jobs_source_type_check;

comment on table public.mc_saas_pos_connections is
  'Business-scoped POS connection profiles. Never store passwords, API secrets, database credentials, or service-role keys here.';
comment on column public.mc_saas_pos_connections.safe_profile is
  'Non-secret connection metadata only. Credentials belong in a secure local agent or managed server secret store.';
