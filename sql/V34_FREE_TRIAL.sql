-- v34: automatic free trial for new shops (default 14 days, everything on), hourly pause of expired
-- subscriptions (data kept), automatic restore when the platform owner extends the date.
alter table public.mc_saas_businesses add column if not exists paused_reason text, add column if not exists paused_pos boolean;

create or replace function public.mc_saas_platform_save_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path to 'public','auth' as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  if p_key not in ('credit_payment_instructions','subscribe_whatsapp','subscribe_note','trial_days') then raise exception 'Unknown setting.'; end if;
  if p_key = 'trial_days' and coalesce(p_value,'') !~ '^[0-9]{1,3}$' then raise exception 'Trial days must be a number.'; end if;
  if p_key = 'subscribe_whatsapp' then p_value := regexp_replace(coalesce(p_value,''), '[^0-9]', '', 'g'); end if;
  insert into public.mc_saas_platform_settings(key, value) values (p_key, left(coalesce(p_value, ''), 2000))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.mc_saas_trial_on_insert()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare d int := 14; v text;
begin
  if coalesce(new.subscription_plan,'trial') = 'trial' and new.subscription_expires_at is null then
    select value into v from public.mc_saas_platform_settings where key = 'trial_days';
    if v ~ '^[0-9]{1,3}$' then d := v::int; end if;
    if d > 0 then
      new.subscription_plan := 'trial';
      new.subscription_expires_at := current_date + d;
      new.is_published := true;
      new.pos_enabled := true;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_trial_insert on public.mc_saas_businesses;
create trigger mc_saas_trial_insert before insert on public.mc_saas_businesses for each row execute function public.mc_saas_trial_on_insert();

create or replace function public.mc_saas_pause_expired()
returns integer language sql security definer set search_path to 'public','pg_temp' as $$
  with x as (
    update public.mc_saas_businesses
       set paused_reason = 'expired', paused_pos = pos_enabled, is_published = false, pos_enabled = false, updated_at = now()
     where subscription_expires_at is not null and subscription_expires_at < current_date
       and paused_reason is null and (is_published or pos_enabled)
    returning 1)
  select count(*)::int from x;
$$;
revoke all on function public.mc_saas_pause_expired() from public, anon, authenticated;

create or replace function public.mc_saas_platform_update_billing(p_business_id uuid, p_subscription_plan text, p_payment_status text, p_subscription_expires_at date, p_payment_note text default '')
returns boolean language plpgsql security definer set search_path to 'public','auth' as $$
begin
  if auth.uid() is null or not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  if p_subscription_plan not in ('trial','monthly','yearly') then raise exception 'Invalid subscription plan.'; end if;
  if p_payment_status not in ('unpaid','paid','overdue') then raise exception 'Invalid payment status.'; end if;
  update public.mc_saas_businesses
     set subscription_plan = p_subscription_plan, payment_status = p_payment_status,
         subscription_expires_at = p_subscription_expires_at, payment_note = left(coalesce(p_payment_note,''),500), updated_at = now()
   where id = p_business_id;
  if not found then raise exception 'Business not found.'; end if;
  -- extended past today: switch back on what the expiry paused
  update public.mc_saas_businesses
     set is_published = true, pos_enabled = coalesce(paused_pos, true), paused_reason = null, paused_pos = null
   where id = p_business_id and paused_reason = 'expired'
     and (subscription_expires_at is null or subscription_expires_at >= current_date);
  return true;
end $$;

create or replace function public.mc_saas_my_subscription(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth','pg_temp' as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then return null; end if;
  select jsonb_build_object('plan', subscription_plan, 'payment_status', payment_status, 'expires', subscription_expires_at,
           'days_left', case when subscription_expires_at is null then null else subscription_expires_at - current_date end,
           'paused', paused_reason is not null,
           'contact', (select value from public.mc_saas_platform_settings where key = 'subscribe_whatsapp'),
           'note', (select value from public.mc_saas_platform_settings where key = 'subscribe_note'))
    into r from public.mc_saas_businesses where id = p_business_id;
  return r;
end $$;
revoke all on function public.mc_saas_my_subscription(uuid) from public, anon;
grant execute on function public.mc_saas_my_subscription(uuid) to authenticated;

select cron.schedule('raffi-pause-expired', '7 * * * *', 'select public.mc_saas_pause_expired()');
