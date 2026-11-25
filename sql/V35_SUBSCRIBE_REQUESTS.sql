-- v35: shops can subscribe without WhatsApp: in-app "Request subscription" + Telegram / phone / email contacts.
create table if not exists public.mc_saas_subscription_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  plan text, contact_phone text, contact_way text, message text,
  status text not null default 'new' check (status in ('new','done','cancelled')),
  created_at timestamptz not null default now(), handled_at timestamptz
);
alter table public.mc_saas_subscription_requests enable row level security;
create policy subreq_own_read on public.mc_saas_subscription_requests for select to authenticated using (public.mc_saas_can_manage(business_id) or public.mc_saas_is_platform_admin());
revoke all on public.mc_saas_subscription_requests from anon;
grant select on public.mc_saas_subscription_requests to authenticated;

create or replace function public.mc_saas_platform_save_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path to 'public','auth' as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  if p_key not in ('credit_payment_instructions','subscribe_whatsapp','subscribe_note','trial_days','subscribe_telegram','subscribe_phone','subscribe_email') then raise exception 'Unknown setting.'; end if;
  if p_key = 'trial_days' and coalesce(p_value,'') !~ '^[0-9]{1,3}$' then raise exception 'Trial days must be a number.'; end if;
  if p_key = 'subscribe_whatsapp' then p_value := regexp_replace(coalesce(p_value,''), '[^0-9]', '', 'g'); end if;
  if p_key = 'subscribe_phone' then p_value := regexp_replace(coalesce(p_value,''), '[^0-9+]', '', 'g'); end if;
  if p_key = 'subscribe_telegram' then p_value := regexp_replace(coalesce(p_value,''), '^@|[^A-Za-z0-9_]', '', 'g'); end if;
  if p_key = 'subscribe_email' and coalesce(p_value,'') <> '' and p_value !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email.'; end if;
  insert into public.mc_saas_platform_settings(key, value) values (p_key, left(coalesce(p_value, ''), 2000))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.mc_saas_my_subscription(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth','pg_temp' as $$
declare r jsonb; s jsonb;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then return null; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into s from public.mc_saas_platform_settings
   where key in ('subscribe_whatsapp','subscribe_note','subscribe_telegram','subscribe_phone','subscribe_email');
  select jsonb_build_object('plan', subscription_plan, 'payment_status', payment_status, 'expires', subscription_expires_at,
           'days_left', case when subscription_expires_at is null then null else subscription_expires_at - current_date end,
           'paused', paused_reason is not null,
           'contact', s->>'subscribe_whatsapp', 'note', s->>'subscribe_note', 'telegram', s->>'subscribe_telegram',
           'phone', s->>'subscribe_phone', 'email', s->>'subscribe_email',
           'pending_request', exists(select 1 from public.mc_saas_subscription_requests q where q.business_id = p_business_id and q.status = 'new'))
    into r from public.mc_saas_businesses where id = p_business_id;
  return r;
end $$;

create or replace function public.mc_saas_request_subscription(p_business_id uuid, p_plan text, p_phone text, p_way text, p_message text default '')
returns uuid language plpgsql security definer set search_path to 'public','auth','extensions','vault','pg_temp' as $$
declare rid uuid; s text;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) < 6 then raise exception 'Type a phone number we can reach you on.'; end if;
  if exists (select 1 from public.mc_saas_subscription_requests where business_id = p_business_id and created_at > now() - interval '10 minutes') then
    raise exception 'Your request was already sent. We will contact you soon.'; end if;
  insert into public.mc_saas_subscription_requests(business_id, user_id, plan, contact_phone, contact_way, message)
  values (p_business_id, auth.uid(), left(coalesce(p_plan,''),40), left(p_phone,40), left(coalesce(p_way,''),20), left(coalesce(p_message,''),500))
  returning id into rid;
  begin
    select decrypted_secret into s from vault.decrypted_secrets where name = 'raffi_order_push_secret';
    perform net.http_post(url := 'https://mkodburhxdrvfacytovb.supabase.co/functions/v1/mc-order-push',
      body := jsonb_build_object('request_id', rid), headers := jsonb_build_object('Content-Type','application/json','x-raffi-secret', s), timeout_milliseconds := 5000);
  exception when others then null; end;
  return rid;
end $$;
revoke all on function public.mc_saas_request_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.mc_saas_request_subscription(uuid, text, text, text, text) to authenticated;

create or replace function public.mc_saas_platform_subscription_requests(p_status text default 'new')
returns table(id uuid, business_id uuid, company_name text, slug text, plan text, contact_phone text, contact_way text, message text, status text, created_at timestamptz, subscription_expires_at date)
language plpgsql stable security definer set search_path to 'public','auth' as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  return query select q.id, q.business_id, b.company_name, b.slug, q.plan, q.contact_phone, q.contact_way, q.message, q.status, q.created_at, b.subscription_expires_at
    from public.mc_saas_subscription_requests q join public.mc_saas_businesses b on b.id = q.business_id
   where p_status = 'all' or q.status = p_status order by q.created_at desc limit 200;
end $$;
create or replace function public.mc_saas_platform_set_request_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public','auth' as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  if p_status not in ('new','done','cancelled') then raise exception 'Invalid status.'; end if;
  update public.mc_saas_subscription_requests set status = p_status, handled_at = case when p_status = 'new' then null else now() end where id = p_id;
end $$;
revoke all on function public.mc_saas_platform_subscription_requests(text) from public, anon;
revoke all on function public.mc_saas_platform_set_request_status(uuid, text) from public, anon;
grant execute on function public.mc_saas_platform_subscription_requests(text) to authenticated;
grant execute on function public.mc_saas_platform_set_request_status(uuid, text) to authenticated;

-- used by the push function to alert the platform owner's devices
create or replace function public.mc_saas_platform_admin_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select user_id from public.mc_saas_platform_admins where is_active = true;
$$;
revoke all on function public.mc_saas_platform_admin_ids() from public, anon, authenticated;
grant execute on function public.mc_saas_platform_admin_ids() to service_role;
