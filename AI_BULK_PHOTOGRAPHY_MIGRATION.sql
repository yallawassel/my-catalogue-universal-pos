-- My Catalogue AI Bulk Photography queue (additive migration; preserves existing data)
begin;
create table if not exists public.mc_saas_ai_photo_batch_items (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 product_id uuid not null references public.mc_saas_products(id) on delete cascade,
 prompt text not null default '',
 status text not null default 'queued' check (status in ('queued','processing','completed','approved','failed')),
 image_url text, ai_job_id uuid references public.mc_saas_ai_jobs(id) on delete set null,
 credits_charged integer not null default 0, error_message text,
 created_at timestamptz not null default now(), completed_at timestamptz, approved_at timestamptz
);
create index if not exists mc_ai_photo_batch_business_created_idx on public.mc_saas_ai_photo_batch_items(business_id,created_at desc);
create index if not exists mc_ai_photo_batch_status_idx on public.mc_saas_ai_photo_batch_items(business_id,status,created_at);
alter table public.mc_saas_ai_photo_batch_items enable row level security;
drop policy if exists mc_ai_photo_batch_member_select on public.mc_saas_ai_photo_batch_items;
create policy mc_ai_photo_batch_member_select on public.mc_saas_ai_photo_batch_items for select to authenticated using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_photo_batch_member_insert on public.mc_saas_ai_photo_batch_items;
create policy mc_ai_photo_batch_member_insert on public.mc_saas_ai_photo_batch_items for insert to authenticated with check (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_photo_batch_member_update on public.mc_saas_ai_photo_batch_items;
create policy mc_ai_photo_batch_member_update on public.mc_saas_ai_photo_batch_items for update to authenticated using (public.mc_saas_can_manage(business_id)) with check (public.mc_saas_can_manage(business_id));
grant select,insert,update on public.mc_saas_ai_photo_batch_items to authenticated;
revoke all on public.mc_saas_ai_photo_batch_items from anon;
commit;
