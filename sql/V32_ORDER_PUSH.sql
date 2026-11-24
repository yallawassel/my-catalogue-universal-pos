-- v32: ring the shop owner's phone when a new online order arrives (Web Push).
create extension if not exists pg_net with schema extensions;

create table if not exists public.mc_saas_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
alter table public.mc_saas_push_subscriptions enable row level security;
create policy push_own_select on public.mc_saas_push_subscriptions for select to authenticated using (user_id = auth.uid());
create index if not exists mc_saas_push_subscriptions_biz on public.mc_saas_push_subscriptions(business_id);
revoke all on public.mc_saas_push_subscriptions from anon;
grant select on public.mc_saas_push_subscriptions to authenticated;

create or replace function public.mc_saas_save_push_subscription(p_business_id uuid, p_sub jsonb, p_device text default null)
returns void language plpgsql security definer set search_path to 'public','auth','pg_temp' as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if coalesce(p_sub->>'endpoint','') !~ '^https://' or coalesce(p_sub#>>'{keys,p256dh}','') = '' or coalesce(p_sub#>>'{keys,auth}','') = '' then raise exception 'Invalid notification subscription.'; end if;
  insert into public.mc_saas_push_subscriptions(business_id, user_id, endpoint, p256dh, auth, device)
  values (p_business_id, auth.uid(), left(p_sub->>'endpoint', 1000), left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100), left(p_device, 120))
  on conflict (endpoint) do update set business_id = excluded.business_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, fail_count = 0;
end $$;
create or replace function public.mc_saas_remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path to 'public','auth','pg_temp' as $$
  delete from public.mc_saas_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.mc_saas_save_push_subscription(uuid, jsonb, text) from public, anon;
revoke all on function public.mc_saas_remove_push_subscription(text) from public, anon;
grant execute on function public.mc_saas_save_push_subscription(uuid, jsonb, text) to authenticated;
grant execute on function public.mc_saas_remove_push_subscription(text) to authenticated;

-- keys live in Vault, never in the code
select vault.create_secret('<VAPID_PUBLIC_KEY>', 'raffi_vapid_public') where not exists (select 1 from vault.secrets where name='raffi_vapid_public');
select vault.create_secret('<VAPID_PRIVATE_KEY>', 'raffi_vapid_private') where not exists (select 1 from vault.secrets where name='raffi_vapid_private');
select vault.create_secret('<RANDOM_SECRET>', 'raffi_order_push_secret') where not exists (select 1 from vault.secrets where name='raffi_order_push_secret');

create or replace function public.mc_saas_push_config()
returns jsonb language sql security definer set search_path to 'public','vault','pg_temp' as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets where name in ('raffi_vapid_public','raffi_vapid_private','raffi_order_push_secret');
$$;
revoke all on function public.mc_saas_push_config() from public, anon, authenticated;
grant execute on function public.mc_saas_push_config() to service_role;

create or replace function public.mc_saas_order_push_notify()
returns trigger language plpgsql security definer set search_path to 'public','vault','extensions','pg_temp' as $$
declare s text;
begin
  if not exists (select 1 from public.mc_saas_push_subscriptions where business_id = new.business_id) then return new; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'raffi_order_push_secret';
  perform net.http_post(
    url := 'https://mkodburhxdrvfacytovb.supabase.co/functions/v1/mc-order-push',
    body := jsonb_build_object('order_id', new.id),
    headers := jsonb_build_object('Content-Type','application/json','x-raffi-secret', s),
    timeout_milliseconds := 5000);
  return new;
exception when others then return new;  -- an alert problem must never block an order
end $$;
drop trigger if exists mc_saas_order_push on public.mc_saas_orders;
create trigger mc_saas_order_push after insert on public.mc_saas_orders for each row execute function public.mc_saas_order_push_notify();
