-- My Catalogue SaaS completion + hardening migration
-- Run AFTER SAAS_MIGRATION.sql and POS_SYNC_MIGRATION.sql in the My Catalogue project.
-- Additive/idempotent: does not delete or rewrite existing catalogue products.
begin;

alter table public.mc_saas_businesses
  add column if not exists catalogue_template text not null default 'classic',
  add column if not exists subscription_plan text not null default 'trial',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists subscription_expires_at date,
  add column if not exists payment_note text not null default '';

alter table public.mc_saas_businesses drop constraint if exists mc_saas_template_allowed;
alter table public.mc_saas_businesses add constraint mc_saas_template_allowed
  check (catalogue_template in ('classic','premium','fresh','shopify','editorial','compact','list','showcase'));
alter table public.mc_saas_businesses drop constraint if exists mc_saas_subscription_plan_allowed;
alter table public.mc_saas_businesses add constraint mc_saas_subscription_plan_allowed
  check (subscription_plan in ('trial','monthly','yearly'));
alter table public.mc_saas_businesses drop constraint if exists mc_saas_payment_status_allowed;
alter table public.mc_saas_businesses add constraint mc_saas_payment_status_allowed
  check (payment_status in ('unpaid','paid','overdue'));

-- Only explicitly allowlisted email addresses can administer the SaaS platform.
create table if not exists public.mc_saas_platform_admins (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint mc_saas_platform_admin_email_lower
    check (email = lower(trim(email)) and position('@' in email) > 1)
);
alter table public.mc_saas_platform_admins enable row level security;
revoke all on public.mc_saas_platform_admins from anon, authenticated;

create or replace function public.mc_saas_is_platform_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists (select 1 from public.mc_saas_platform_admins a
    where a.email=lower(coalesce(auth.jwt()->>'email','')));
$$;
revoke all on function public.mc_saas_is_platform_admin() from public;
grant execute on function public.mc_saas_is_platform_admin() to authenticated;

-- Replace the original trigger function so direct table updates cannot alter billing/publication.
create or replace function public.mc_saas_protect_platform_fields()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is not null and not public.mc_saas_is_platform_admin() and (
    new.owner_id is distinct from old.owner_id or
    new.is_published is distinct from old.is_published or
    new.slug is distinct from old.slug or
    new.subscription_plan is distinct from old.subscription_plan or
    new.payment_status is distinct from old.payment_status or
    new.subscription_expires_at is distinct from old.subscription_expires_at or
    new.payment_note is distinct from old.payment_note
  ) then
    raise exception 'These business and subscription fields are controlled by the platform administrator.';
  end if;
  return new;
end;
$$;

create or replace function public.mc_saas_update_business_settings(
  p_business_id uuid, p_company_name text, p_description text default '',
  p_whatsapp text default '', p_currency text default 'USD',
  p_logo_url text default '', p_primary_color text default '#173f35'
) returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then
    raise exception 'You do not have permission to manage this business.';
  end if;
  if nullif(trim(p_company_name),'') is null then raise exception 'Business name is required.'; end if;
  if coalesce(p_primary_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid six-digit brand color.'; end if;
  if coalesce(trim(p_currency),'') not in ('USD','LBP','EUR','GBP') then raise exception 'Unsupported currency.'; end if;
  update public.mc_saas_businesses set
    company_name=left(trim(p_company_name),160), description=left(coalesce(p_description,''),2000),
    whatsapp=left(regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g'),40),
    currency=trim(p_currency), logo_url=left(coalesce(p_logo_url,''),2048),
    primary_color=p_primary_color, updated_at=now()
  where id=p_business_id;
  return found;
end;
$$;

create or replace function public.mc_saas_update_catalogue_template(p_business_id uuid,p_template text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then
    raise exception 'You do not have permission to manage this business.';
  end if;
  if p_template not in ('classic','premium','fresh','shopify','editorial','compact','list','showcase') then
    raise exception 'Unknown catalogue design.';
  end if;
  update public.mc_saas_businesses set catalogue_template=p_template,updated_at=now() where id=p_business_id;
  return found;
end;
$$;

create or replace function public.mc_saas_platform_list_businesses()
returns setof public.mc_saas_businesses language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  return query select b.* from public.mc_saas_businesses b order by b.created_at desc;
end;
$$;

create or replace function public.mc_saas_platform_set_published(p_business_id uuid,p_published boolean)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  update public.mc_saas_businesses set is_published=coalesce(p_published,false),updated_at=now() where id=p_business_id;
  if not found then raise exception 'Business not found.'; end if;
  return true;
end;
$$;

create or replace function public.mc_saas_platform_update_billing(
  p_business_id uuid,p_subscription_plan text,p_payment_status text,
  p_subscription_expires_at date default null,p_payment_note text default ''
) returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  if p_subscription_plan not in ('trial','monthly','yearly') then raise exception 'Invalid subscription plan.'; end if;
  if p_payment_status not in ('unpaid','paid','overdue') then raise exception 'Invalid payment status.'; end if;
  update public.mc_saas_businesses set subscription_plan=p_subscription_plan,
    payment_status=p_payment_status,subscription_expires_at=p_subscription_expires_at,
    payment_note=left(coalesce(p_payment_note,''),500),updated_at=now()
  where id=p_business_id;
  if not found then raise exception 'Business not found.'; end if;
  return true;
end;
$$;

revoke all on function public.mc_saas_update_business_settings(uuid,text,text,text,text,text,text) from public;
revoke all on function public.mc_saas_update_catalogue_template(uuid,text) from public;
revoke all on function public.mc_saas_platform_list_businesses() from public;
revoke all on function public.mc_saas_platform_set_published(uuid,boolean) from public;
revoke all on function public.mc_saas_platform_update_billing(uuid,text,text,date,text) from public;
grant execute on function public.mc_saas_update_business_settings(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.mc_saas_update_catalogue_template(uuid,text) to authenticated;
grant execute on function public.mc_saas_platform_list_businesses() to authenticated;
grant execute on function public.mc_saas_platform_set_published(uuid,boolean) to authenticated;
grant execute on function public.mc_saas_platform_update_billing(uuid,text,text,date,text) to authenticated;

commit;

-- ONE-TIME PLATFORM SETUP (replace with the platform owner's sign-in email):
-- insert into public.mc_saas_platform_admins(email)
-- values (lower('YOUR-ADMIN-EMAIL@example.com')) on conflict(email) do nothing;
-- Never place a Supabase service-role key in browser HTML/JavaScript.
