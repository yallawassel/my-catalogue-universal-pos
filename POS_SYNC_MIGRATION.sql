-- My Catalogue: Universal POS / Excel synchronization
-- Run once in Supabase SQL Editor after taking a database backup.
-- Safe additive migration: does not delete or rewrite existing catalogue rows.

alter table public.mc_saas_products
  add column if not exists sku text not null default '',
  add column if not exists pos_product_id text not null default '';

-- SKU is a required unique catalogue identifier for newly created products; barcode is the primary sync match key.
-- If this check raises an error, review/fix duplicate SKUs in the catalogue first.
do $$
begin
  if exists (
    select 1
    from public.mc_saas_products
    where coalesce(trim(sku), '') <> ''
    group by business_id, lower(trim(sku))
    having count(*) > 1
  ) then
    raise exception 'Duplicate SKUs already exist. Resolve duplicate SKUs in the catalogue, then run this migration again.';
  end if;
end $$;

create unique index if not exists mc_saas_products_business_sku
  on public.mc_saas_products(business_id, lower(trim(sku)))
  where trim(sku) <> '';
create index if not exists mc_saas_products_business_pos_id
  on public.mc_saas_products(business_id, pos_product_id) where pos_product_id <> '';

create table if not exists public.mc_saas_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  source_type text not null default 'file' check (source_type in ('file','api','manual')),
  sync_mode text not null default 'price' check (sync_mode in ('price','full')),
  status text not null default 'running' check (status in ('running','completed','completed_with_errors','failed')),
  markup_pct numeric(8,2) not null default 0,
  rows_total integer not null default 0,
  rows_updated integer not null default 0,
  rows_added integer not null default 0,
  rows_failed integer not null default 0,
  error_summary jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mc_saas_sync_jobs_business_started
  on public.mc_saas_sync_jobs(business_id, started_at desc);

create table if not exists public.mc_saas_sync_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  job_id uuid references public.mc_saas_sync_jobs(id) on delete set null,
  product_id uuid references public.mc_saas_products(id) on delete set null,
  match_method text not null default 'unknown',
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mc_saas_sync_changes_business_created
  on public.mc_saas_sync_changes(business_id, created_at desc);

alter table public.mc_saas_sync_jobs enable row level security;
alter table public.mc_saas_sync_changes enable row level security;

drop policy if exists mc_saas_sync_jobs_manage on public.mc_saas_sync_jobs;
create policy mc_saas_sync_jobs_manage on public.mc_saas_sync_jobs
  for all to authenticated
  using (public.mc_saas_can_manage(business_id))
  with check (public.mc_saas_can_manage(business_id));

drop policy if exists mc_saas_sync_changes_manage on public.mc_saas_sync_changes;
create policy mc_saas_sync_changes_manage on public.mc_saas_sync_changes
  for all to authenticated
  using (public.mc_saas_can_manage(business_id))
  with check (public.mc_saas_can_manage(business_id));

grant select, insert, update on public.mc_saas_sync_jobs to authenticated;
grant select, insert on public.mc_saas_sync_changes to authenticated;

-- No anonymous access to synchronization history or change logs.
revoke all on public.mc_saas_sync_jobs from anon;
revoke all on public.mc_saas_sync_changes from anon;
