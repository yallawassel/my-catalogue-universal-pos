-- My Catalogue AI Studio foundation (additive; preserves existing catalogue/order data)
-- Run ONLY in the My Catalogue Supabase project after taking a database backup.
begin;

-- Fail early if this is not the existing My Catalogue SaaS database.
do $$
begin
  if to_regclass('public.mc_saas_businesses') is null
     or to_regclass('public.mc_saas_members') is null
     or to_regprocedure('public.mc_saas_can_manage(uuid)') is null
     or to_regprocedure('public.mc_saas_is_platform_admin()') is null then
    raise exception 'My Catalogue SaaS foundation is missing. Confirm the correct Supabase project and install the existing SaaS + hardening migrations before AI Studio.';
  end if;
end;
$$;

create table if not exists public.mc_saas_ai_wallets (
  business_id uuid primary key references public.mc_saas_businesses(id) on delete cascade,
  credits_balance integer not null default 0 check (credits_balance >= 0),
  lifetime_credits_added bigint not null default 0,
  lifetime_credits_used bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.mc_saas_ai_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entry_type text not null check (entry_type in ('welcome','subscription','purchase','usage','refund','admin_adjustment')),
  credits integer not null check (credits <> 0),
  action text not null,
  reference_id text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mc_saas_ai_ledger_business_created_idx on public.mc_saas_ai_ledger(business_id,created_at desc);

create table if not exists public.mc_saas_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_type text not null check (job_type in ('chat','generate_image','edit_image')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  prompt text not null default '',
  credits_charged integer not null default 0,
  result_url text,
  error_message text,
  provider_model text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mc_saas_ai_jobs_business_created_idx on public.mc_saas_ai_jobs(business_id,created_at desc);

create table if not exists public.mc_saas_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New AI conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mc_saas_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mc_saas_ai_conversations(id) on delete cascade,
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mc_saas_ai_plans (
  plan_key text primary key,
  display_name text not null,
  monthly_price_usd numeric(10,2) not null default 0 check (monthly_price_usd >= 0),
  included_monthly_credits integer not null default 0 check (included_monthly_credits >= 0),
  max_products integer,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.mc_saas_ai_plans(plan_key,display_name,monthly_price_usd,included_monthly_credits,max_products,features) values
 ('free','Free',0,0,50,'{"templates":["classic","fresh"],"ai_chat":false,"ai_photos":false}'::jsonb),
 ('starter','Starter',5,0,250,'{"templates":"standard","ai_chat":false,"ai_photos":false}'::jsonb),
 ('professional','Professional',10,30,1000,'{"templates":"premium","ai_chat":true,"ai_photos":true}'::jsonb),
 ('business','Business',20,100,null,'{"templates":"all","ai_chat":true,"ai_photos":true,"bulk_tools":true}'::jsonb)
on conflict(plan_key) do update set display_name=excluded.display_name,monthly_price_usd=excluded.monthly_price_usd,included_monthly_credits=excluded.included_monthly_credits,max_products=excluded.max_products,features=excluded.features,updated_at=now();

alter table public.mc_saas_ai_wallets enable row level security;
alter table public.mc_saas_ai_ledger enable row level security;
alter table public.mc_saas_ai_jobs enable row level security;
alter table public.mc_saas_ai_conversations enable row level security;
alter table public.mc_saas_ai_messages enable row level security;
alter table public.mc_saas_ai_plans enable row level security;

drop policy if exists mc_ai_wallet_member_read on public.mc_saas_ai_wallets;
create policy mc_ai_wallet_member_read on public.mc_saas_ai_wallets for select to authenticated using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_ledger_member_read on public.mc_saas_ai_ledger;
create policy mc_ai_ledger_member_read on public.mc_saas_ai_ledger for select to authenticated using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_jobs_member_read on public.mc_saas_ai_jobs;
create policy mc_ai_jobs_member_read on public.mc_saas_ai_jobs for select to authenticated using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_conversations_member_all on public.mc_saas_ai_conversations;
create policy mc_ai_conversations_member_all on public.mc_saas_ai_conversations for all to authenticated using (public.mc_saas_can_manage(business_id) and user_id=auth.uid()) with check (public.mc_saas_can_manage(business_id) and user_id=auth.uid());
drop policy if exists mc_ai_messages_member_read on public.mc_saas_ai_messages;
create policy mc_ai_messages_member_read on public.mc_saas_ai_messages for select to authenticated using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_ai_plans_public_read on public.mc_saas_ai_plans;
create policy mc_ai_plans_public_read on public.mc_saas_ai_plans for select to anon,authenticated using (active=true);

revoke all on public.mc_saas_ai_wallets,public.mc_saas_ai_ledger,public.mc_saas_ai_jobs,public.mc_saas_ai_conversations,public.mc_saas_ai_messages from anon;
grant select on public.mc_saas_ai_wallets,public.mc_saas_ai_ledger,public.mc_saas_ai_jobs to authenticated;
grant select,insert,update,delete on public.mc_saas_ai_conversations to authenticated;
grant select on public.mc_saas_ai_messages,public.mc_saas_ai_plans to authenticated;
grant select on public.mc_saas_ai_plans to anon;

-- A one-time introductory balance for existing businesses; this is not a recurring allowance.
insert into public.mc_saas_ai_wallets(business_id,credits_balance,lifetime_credits_added)
select id,15,15 from public.mc_saas_businesses on conflict(business_id) do nothing;
insert into public.mc_saas_ai_ledger(business_id,entry_type,credits,action,note)
select b.id,'welcome',15,'launch_welcome','One-time AI Studio launch credits' from public.mc_saas_businesses b
where not exists(select 1 from public.mc_saas_ai_ledger l where l.business_id=b.id and l.action='launch_welcome');

-- Automatically give newly created businesses the same one-time launch balance.
create or replace function public.mc_saas_ai_seed_new_business_wallet()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.mc_saas_ai_wallets(business_id,credits_balance,lifetime_credits_added) values(new.id,15,15) on conflict(business_id) do nothing;
 insert into public.mc_saas_ai_ledger(business_id,entry_type,credits,action,note) values(new.id,'welcome',15,'launch_welcome','One-time AI Studio launch credits') on conflict do nothing;
 return new;
end;$$;
drop trigger if exists mc_saas_ai_seed_business_wallet on public.mc_saas_businesses;
create trigger mc_saas_ai_seed_business_wallet after insert on public.mc_saas_businesses for each row execute function public.mc_saas_ai_seed_new_business_wallet();

create or replace function public.mc_saas_ai_get_wallet(p_business_id uuid)
returns table(credits_balance integer,lifetime_credits_added bigint,lifetime_credits_used bigint)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Business access required.'; end if;
 return query select w.credits_balance,w.lifetime_credits_added,w.lifetime_credits_used from public.mc_saas_ai_wallets w where w.business_id=p_business_id;
end;$$;

create or replace function public.mc_saas_ai_consume_credits(p_business_id uuid,p_credits integer,p_action text,p_reference_id text default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_balance integer;
begin
 if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Business access required.'; end if;
 if p_credits not between 1 and 100 then raise exception 'Invalid credit amount.'; end if;
 update public.mc_saas_ai_wallets set credits_balance=credits_balance-p_credits,lifetime_credits_used=lifetime_credits_used+p_credits,updated_at=now()
 where business_id=p_business_id and credits_balance>=p_credits returning credits_balance into v_balance;
 if v_balance is null then raise exception 'Not enough AI credits. Please purchase credits or upgrade your plan.'; end if;
 insert into public.mc_saas_ai_ledger(business_id,actor_user_id,entry_type,credits,action,reference_id)
 values(p_business_id,auth.uid(),'usage',-p_credits,left(coalesce(p_action,'ai_usage'),80),p_reference_id);
 return v_balance;
end;$$;

create or replace function public.mc_saas_ai_refund_credits(p_business_id uuid,p_credits integer,p_action text,p_reference_id text default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_balance integer;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role access is required.'; end if;
 if p_credits not between 1 and 100 then raise exception 'Invalid credit amount.'; end if;
 update public.mc_saas_ai_wallets set credits_balance=credits_balance+p_credits,lifetime_credits_used=greatest(0,lifetime_credits_used-p_credits),updated_at=now()
 where business_id=p_business_id returning credits_balance into v_balance;
 if v_balance is null then raise exception 'AI wallet not found.'; end if;
 insert into public.mc_saas_ai_ledger(business_id,actor_user_id,entry_type,credits,action,reference_id,note)
 values(p_business_id,auth.uid(),'refund',p_credits,left(coalesce(p_action,'ai_refund'),80),p_reference_id,'Automatic refund after failed AI request');
 return v_balance;
end;$$;

create or replace function public.mc_saas_ai_grant_credits(p_business_id uuid,p_credits integer,p_note text default '')
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_balance integer;
begin
 if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
 if p_credits not between 1 and 100000 then raise exception 'Invalid credit amount.'; end if;
 insert into public.mc_saas_ai_wallets(business_id,credits_balance,lifetime_credits_added) values(p_business_id,p_credits,p_credits)
 on conflict(business_id) do update set credits_balance=mc_saas_ai_wallets.credits_balance+p_credits,lifetime_credits_added=mc_saas_ai_wallets.lifetime_credits_added+p_credits,updated_at=now()
 returning credits_balance into v_balance;
 insert into public.mc_saas_ai_ledger(business_id,actor_user_id,entry_type,credits,action,note) values(p_business_id,auth.uid(),'admin_adjustment',p_credits,'platform_credit_grant',left(coalesce(p_note,''),500));
 return v_balance;
end;$$;

revoke all on function public.mc_saas_ai_get_wallet(uuid) from public;
revoke all on function public.mc_saas_ai_consume_credits(uuid,integer,text,text) from public;
revoke all on function public.mc_saas_ai_refund_credits(uuid,integer,text,text) from public;
revoke all on function public.mc_saas_ai_grant_credits(uuid,integer,text) from public;
grant execute on function public.mc_saas_ai_get_wallet(uuid) to authenticated;
grant execute on function public.mc_saas_ai_consume_credits(uuid,integer,text,text) to authenticated;
grant execute on function public.mc_saas_ai_refund_credits(uuid,integer,text,text) to service_role;
grant execute on function public.mc_saas_ai_grant_credits(uuid,integer,text) to authenticated;

commit;
