-- My Catalogue v10 — AI credit packs, manual payments (Whish / OMT / cash / bank) and real AI cost tracking.
-- Additive. Safe to run once on the My Catalogue project.

-- 1) Credit packs (prices editable by the platform owner)
create table if not exists public.mc_saas_ai_credit_packs (
  pack_key text primary key check (pack_key ~ '^[a-z0-9_-]{2,40}$'),
  display_name text not null,
  credits integer not null check (credits between 1 and 100000),
  price_usd numeric(10,2) not null check (price_usd >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.mc_saas_ai_credit_packs(pack_key, display_name, credits, price_usd, sort_order) values
  ('pack_50',  '50 pro photos',  50,  5.00, 1),
  ('pack_150', '150 pro photos', 150, 12.00, 2),
  ('pack_500', '500 pro photos', 500, 35.00, 3)
on conflict (pack_key) do nothing;
alter table public.mc_saas_ai_credit_packs enable row level security;
drop policy if exists mc_ai_packs_read on public.mc_saas_ai_credit_packs;
create policy mc_ai_packs_read on public.mc_saas_ai_credit_packs for select to authenticated using (active or public.mc_saas_is_platform_admin());
revoke all on public.mc_saas_ai_credit_packs from anon, authenticated;
grant select on public.mc_saas_ai_credit_packs to authenticated;

-- 2) Platform settings (payment instructions shown to clients)
create table if not exists public.mc_saas_platform_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.mc_saas_platform_settings(key, value) values
  ('credit_payment_instructions', 'Send the amount by Whish Money or OMT to +961 XX XXX XXX (name: …) and write your business name as the reference. Credits are added as soon as the payment is confirmed.')
on conflict (key) do nothing;
alter table public.mc_saas_platform_settings enable row level security;
drop policy if exists mc_platform_settings_read on public.mc_saas_platform_settings;
create policy mc_platform_settings_read on public.mc_saas_platform_settings for select to authenticated using (true);
revoke all on public.mc_saas_platform_settings from anon, authenticated;
grant select on public.mc_saas_platform_settings to authenticated;

-- 3) Credit purchase requests
create table if not exists public.mc_saas_ai_credit_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  pack_key text not null,
  pack_name text not null,
  credits integer not null check (credits > 0),
  price_usd numeric(10,2) not null,
  payment_method text not null check (payment_method in ('whish','omt','cash','bank','other')),
  payment_reference text not null default '',
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  admin_note text not null default ''
);
create index if not exists mc_saas_ai_credit_orders_business_idx on public.mc_saas_ai_credit_orders(business_id, created_at desc);
create index if not exists mc_saas_ai_credit_orders_status_idx on public.mc_saas_ai_credit_orders(status, created_at desc);
alter table public.mc_saas_ai_credit_orders enable row level security;
drop policy if exists mc_ai_credit_orders_read on public.mc_saas_ai_credit_orders;
create policy mc_ai_credit_orders_read on public.mc_saas_ai_credit_orders for select to authenticated
  using (public.mc_saas_can_manage(business_id) or public.mc_saas_is_platform_admin());
revoke all on public.mc_saas_ai_credit_orders from anon, authenticated;
grant select on public.mc_saas_ai_credit_orders to authenticated;

create or replace function public.mc_saas_ai_request_credits(p_business_id uuid, p_pack_key text, p_payment_method text, p_reference text default '')
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_pack record; v_id uuid;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Business access required.'; end if;
  select * into v_pack from public.mc_saas_ai_credit_packs where pack_key = p_pack_key and active;
  if not found then raise exception 'This credit pack is not available.'; end if;
  if p_payment_method not in ('whish','omt','cash','bank','other') then raise exception 'Choose a payment method.'; end if;
  if (select count(*) from public.mc_saas_ai_credit_orders where business_id = p_business_id and status = 'pending') >= 3 then
    raise exception 'You already have 3 requests waiting for payment confirmation.';
  end if;
  insert into public.mc_saas_ai_credit_orders(business_id, pack_key, pack_name, credits, price_usd, payment_method, payment_reference, requested_by)
  values (p_business_id, v_pack.pack_key, v_pack.display_name, v_pack.credits, v_pack.price_usd, p_payment_method, left(coalesce(p_reference, ''), 200), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mc_saas_ai_cancel_credit_request(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_business uuid;
begin
  select business_id into v_business from public.mc_saas_ai_credit_orders where id = p_order_id and status = 'pending';
  if v_business is null then raise exception 'Request not found or already processed.'; end if;
  if not (public.mc_saas_can_manage(v_business) or public.mc_saas_is_platform_admin()) then raise exception 'Access denied.'; end if;
  update public.mc_saas_ai_credit_orders set status = 'cancelled', decided_at = now(), decided_by = auth.uid() where id = p_order_id and status = 'pending';
end $$;

create or replace function public.mc_saas_platform_list_credit_orders(p_status text default 'pending')
returns table(id uuid, business_id uuid, company_name text, slug text, pack_name text, credits integer, price_usd numeric,
              payment_method text, payment_reference text, status text, created_at timestamptz, decided_at timestamptz, admin_note text, credits_balance integer)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  return query
    select o.id, o.business_id, b.company_name, b.slug, o.pack_name, o.credits, o.price_usd, o.payment_method, o.payment_reference,
           o.status, o.created_at, o.decided_at, o.admin_note, coalesce(w.credits_balance, 0)
      from public.mc_saas_ai_credit_orders o
      join public.mc_saas_businesses b on b.id = o.business_id
      left join public.mc_saas_ai_wallets w on w.business_id = o.business_id
     where p_status = 'all' or o.status = p_status
     order by o.created_at desc limit 300;
end $$;

create or replace function public.mc_saas_platform_mark_credit_order_paid(p_order_id uuid, p_note text default '')
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_o record; v_balance integer;
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  select * into v_o from public.mc_saas_ai_credit_orders where id = p_order_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if v_o.status <> 'pending' then raise exception 'This request is already %.', v_o.status; end if;
  insert into public.mc_saas_ai_wallets(business_id, credits_balance, lifetime_credits_added) values (v_o.business_id, v_o.credits, v_o.credits)
  on conflict (business_id) do update set credits_balance = mc_saas_ai_wallets.credits_balance + v_o.credits,
    lifetime_credits_added = mc_saas_ai_wallets.lifetime_credits_added + v_o.credits, updated_at = now()
  returning credits_balance into v_balance;
  insert into public.mc_saas_ai_ledger(business_id, actor_user_id, entry_type, credits, action, reference_id, note)
  values (v_o.business_id, auth.uid(), 'purchase', v_o.credits, 'credit_pack_purchase', v_o.id::text,
          left(v_o.pack_name || ' · $' || v_o.price_usd || ' · ' || v_o.payment_method || coalesce(' · ' || nullif(p_note, ''), ''), 500));
  update public.mc_saas_ai_credit_orders set status = 'paid', decided_at = now(), decided_by = auth.uid(), admin_note = left(coalesce(p_note, ''), 500) where id = p_order_id;
  return v_balance;
end $$;

create or replace function public.mc_saas_platform_save_credit_pack(p_pack_key text, p_display_name text, p_credits integer, p_price_usd numeric, p_active boolean, p_sort_order integer default 0)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  insert into public.mc_saas_ai_credit_packs(pack_key, display_name, credits, price_usd, active, sort_order)
  values (lower(trim(p_pack_key)), left(trim(p_display_name), 80), p_credits, p_price_usd, coalesce(p_active, true), coalesce(p_sort_order, 0))
  on conflict (pack_key) do update set display_name = excluded.display_name, credits = excluded.credits, price_usd = excluded.price_usd,
    active = excluded.active, sort_order = excluded.sort_order, updated_at = now();
end $$;

create or replace function public.mc_saas_platform_save_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  if p_key not in ('credit_payment_instructions') then raise exception 'Unknown setting.'; end if;
  insert into public.mc_saas_platform_settings(key, value) values (p_key, left(coalesce(p_value, ''), 2000))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

do $$ declare f text; begin
  foreach f in array array['mc_saas_ai_request_credits(uuid,text,text,text)','mc_saas_ai_cancel_credit_request(uuid)',
    'mc_saas_platform_list_credit_orders(text)','mc_saas_platform_mark_credit_order_paid(uuid,text)',
    'mc_saas_platform_save_credit_pack(text,text,integer,numeric,boolean,integer)','mc_saas_platform_save_setting(text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 4) Real provider cost per AI job (for your margin reports)
alter table public.mc_saas_ai_jobs add column if not exists provider_usage jsonb;
alter table public.mc_saas_ai_jobs add column if not exists provider_cost_usd numeric(10,5);
alter table public.mc_saas_ai_jobs drop constraint if exists mc_saas_ai_jobs_job_type_check;
alter table public.mc_saas_ai_jobs add constraint mc_saas_ai_jobs_job_type_check check (job_type in ('chat','generate_image','edit_image','pro_photo'));

-- 5) Platform owner report: AI usage, credits and real provider cost per business
create or replace function public.mc_saas_platform_ai_usage_report(p_days integer default 30)
returns table(business_id uuid, company_name text, photos integer, chats integer, credits_used integer, provider_cost_usd numeric, credits_balance integer)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  return query
    select b.id, b.company_name,
           count(*) filter (where j.job_type <> 'chat' and j.status = 'completed')::integer,
           count(*) filter (where j.job_type = 'chat' and j.status = 'completed')::integer,
           coalesce(sum(j.credits_charged) filter (where j.status = 'completed'), 0)::integer,
           coalesce(sum(j.provider_cost_usd), 0)::numeric,
           coalesce(max(w.credits_balance), 0)::integer
      from public.mc_saas_businesses b
      left join public.mc_saas_ai_jobs j on j.business_id = b.id and j.created_at > now() - make_interval(days => greatest(1, least(p_days, 366)))
      left join public.mc_saas_ai_wallets w on w.business_id = b.id
     group by b.id, b.company_name
     order by 5 desc, 2;
end $$;
revoke all on function public.mc_saas_platform_ai_usage_report(integer) from public, anon;
grant execute on function public.mc_saas_platform_ai_usage_report(integer) to authenticated;
