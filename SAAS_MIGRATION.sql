-- My Catalogue multi-business SaaS schema (isolated mc_saas_* tables)
-- Run ONLY in the intended My Catalogue Supabase project after taking a backup.
-- Does not modify or delete legacy catalogue_products/catalogue_settings or White Pack tables.
begin;
create extension if not exists pgcrypto;

create table if not exists public.mc_saas_businesses (
 id uuid primary key default gen_random_uuid(),
 company_name text not null,
 slug text not null unique,
 description text not null default '',
 whatsapp text not null default '',
 currency text not null default 'USD',
 logo_url text not null default '',
 primary_color text not null default '#173f35',
 owner_id uuid not null references auth.users(id) on delete restrict,
 is_published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint mc_saas_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 constraint mc_saas_color_format check (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index if not exists mc_saas_one_business_per_owner on public.mc_saas_businesses(owner_id);

create table if not exists public.mc_saas_members (
 business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'owner' check (role in ('owner','admin','editor','driver')),
 created_at timestamptz not null default now(),
 primary key (business_id,user_id)
);

create or replace function public.mc_saas_is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
 select exists(select 1 from public.mc_saas_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role in ('owner','admin','editor','driver'));
$$;
create or replace function public.mc_saas_can_manage(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
 select exists(select 1 from public.mc_saas_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role in ('owner','admin','editor'));
$$;
create or replace function public.mc_saas_create_business(p_company_name text,p_slug text,p_description text default '',p_whatsapp text default '',p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare new_id uuid; clean_slug text;
begin
 if auth.uid() is null then raise exception 'Sign in before creating a business.'; end if;
 if exists(select 1 from public.mc_saas_businesses where owner_id=auth.uid()) then raise exception 'This account already has a business.'; end if;
 clean_slug := lower(trim(p_slug));
 if clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Use lowercase letters, numbers and hyphens for the catalogue link.'; end if;
 insert into public.mc_saas_businesses(company_name,slug,description,whatsapp,currency,owner_id)
 values (left(trim(p_company_name),160),clean_slug,coalesce(p_description,''),coalesce(p_whatsapp,''),coalesce(nullif(trim(p_currency),''),'USD'),auth.uid()) returning id into new_id;
 insert into public.mc_saas_members(business_id,user_id,role) values(new_id,auth.uid(),'owner');
 return new_id;
end $$;
revoke all on function public.mc_saas_create_business(text,text,text,text,text) from public;
grant execute on function public.mc_saas_create_business(text,text,text,text,text) to authenticated;

create table if not exists public.mc_saas_categories (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 name text not null, image_url text not null default '', sort_order integer not null default 0, created_at timestamptz not null default now(),
 unique(business_id,name), unique(business_id,id)
);
create table if not exists public.mc_saas_products (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 name text not null, category text not null default 'Products', description text not null default '', image text not null default '', barcode text not null default '',
 label1 text not null default 'Packet', price1 numeric(12,2), label2 text not null default 'Box', price2 numeric(12,2),
 extra_info jsonb not null default '{}'::jsonb, sort_order integer not null default 0, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint mc_saas_price1_nonnegative check (price1 is null or price1>=0), constraint mc_saas_price2_nonnegative check (price2 is null or price2>=0)
);
create index if not exists mc_saas_products_business_order on public.mc_saas_products(business_id,sort_order,name);

create table if not exists public.mc_saas_orders (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 order_number bigint generated by default as identity, customer_name text not null, customer_phone text not null,
 delivery_address text not null default '', delivery_lat double precision, delivery_lng double precision, location_shared boolean not null default false,
 notes text not null default '', items jsonb not null default '[]'::jsonb, currency text not null default 'USD', subtotal numeric(12,2) not null default 0,
 total numeric(12,2) not null default 0, order_status text not null default 'new' check(order_status in ('new','confirmed','preparing','out_for_delivery','delivered','cancelled')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partial','paid')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists mc_saas_orders_business_created on public.mc_saas_orders(business_id,created_at desc);

create table if not exists public.mc_saas_quotations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict, quotation_number text not null,
 client_name text not null, client_phone text not null default '', quote_data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,quotation_number)
);
create index if not exists mc_saas_quotes_business_updated on public.mc_saas_quotations(business_id,updated_at desc);

create table if not exists public.mc_saas_driver_locations (
 order_id uuid primary key references public.mc_saas_orders(id) on delete cascade, business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 driver_id uuid not null references auth.users(id) on delete cascade, latitude double precision not null, longitude double precision not null,
 accuracy_m integer not null default 0, is_sharing boolean not null default true, updated_at timestamptz not null default now()
);

create table if not exists public.mc_saas_custom_domains (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
 domain text not null unique, verification_token text not null default encode(gen_random_bytes(18),'hex'), verified boolean not null default false,
 active boolean not null default false, created_at timestamptz not null default now(), unique(business_id,domain),
 constraint mc_saas_domain_lower check(domain=lower(domain) and domain !~ '^https?://' and domain !~ '/' and domain !~ '\s')
);

-- RLS: clear policies on only our own tables to avoid accidental permissive policies.
do $$ declare t text; p record; begin
 foreach t in array array['mc_saas_businesses','mc_saas_members','mc_saas_categories','mc_saas_products','mc_saas_orders','mc_saas_quotations','mc_saas_driver_locations','mc_saas_custom_domains'] loop
  execute format('alter table public.%I enable row level security',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',p.policyname,t); end loop;
 end loop;
end $$;

create policy mc_saas_business_public_read on public.mc_saas_businesses for select to anon,authenticated using(is_published=true or owner_id=auth.uid() or public.mc_saas_is_member(id));
create policy mc_saas_business_owner_update on public.mc_saas_businesses for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create or replace function public.mc_saas_protect_platform_fields() returns trigger language plpgsql security invoker set search_path=public,auth as $$ begin if auth.uid() is not null and (new.owner_id is distinct from old.owner_id or new.is_published is distinct from old.is_published or new.slug is distinct from old.slug) then raise exception 'Owner, catalogue slug and publication status are controlled by the platform administrator.'; end if; return new; end $$;
drop trigger if exists mc_saas_protect_platform_fields_trg on public.mc_saas_businesses;
create trigger mc_saas_protect_platform_fields_trg before update on public.mc_saas_businesses for each row execute function public.mc_saas_protect_platform_fields();
create policy mc_saas_member_read on public.mc_saas_members for select to authenticated using(user_id=auth.uid() or public.mc_saas_can_manage(business_id));
-- Membership creation is only through the security-definer creation function; no client-side insert/delete policies.
create policy mc_saas_categories_public_read on public.mc_saas_categories for select to anon,authenticated using(exists(select 1 from public.mc_saas_businesses b where b.id=business_id and b.is_published=true) or public.mc_saas_can_manage(business_id));
create policy mc_saas_categories_manage on public.mc_saas_categories for all to authenticated using(public.mc_saas_can_manage(business_id)) with check(public.mc_saas_can_manage(business_id));
create policy mc_saas_products_public_read on public.mc_saas_products for select to anon,authenticated using((is_active=true and exists(select 1 from public.mc_saas_businesses b where b.id=business_id and b.is_published=true)) or public.mc_saas_can_manage(business_id));
create policy mc_saas_products_manage on public.mc_saas_products for all to authenticated using(public.mc_saas_can_manage(business_id)) with check(public.mc_saas_can_manage(business_id));
create policy mc_saas_orders_public_insert on public.mc_saas_orders for insert to anon,authenticated with check(exists(select 1 from public.mc_saas_businesses b where b.id=business_id and b.is_published=true) and length(trim(customer_name)) between 1 and 160 and length(trim(customer_phone)) between 3 and 40 and jsonb_typeof(items)='array');
create policy mc_saas_orders_staff_read on public.mc_saas_orders for select to authenticated using(public.mc_saas_can_manage(business_id));
create policy mc_saas_orders_driver_read on public.mc_saas_orders for select to authenticated using(order_status in ('confirmed','preparing','out_for_delivery') and exists(select 1 from public.mc_saas_members m where m.business_id=mc_saas_orders.business_id and m.user_id=auth.uid() and m.role='driver'));
create policy mc_saas_orders_staff_update on public.mc_saas_orders for update to authenticated using(public.mc_saas_can_manage(business_id)) with check(public.mc_saas_can_manage(business_id));
create policy mc_saas_quotes_read on public.mc_saas_quotations for select to authenticated using(public.mc_saas_can_manage(business_id));
create policy mc_saas_quotes_insert on public.mc_saas_quotations for insert to authenticated with check(public.mc_saas_can_manage(business_id) and created_by=auth.uid());
create policy mc_saas_quotes_update on public.mc_saas_quotations for update to authenticated using(public.mc_saas_can_manage(business_id)) with check(public.mc_saas_can_manage(business_id));
create policy mc_saas_quotes_delete on public.mc_saas_quotations for delete to authenticated using(public.mc_saas_can_manage(business_id));
create policy mc_saas_driver_read on public.mc_saas_driver_locations for select to authenticated using(public.mc_saas_can_manage(business_id) or public.mc_saas_is_member(business_id));
create policy mc_saas_driver_insert on public.mc_saas_driver_locations for insert to authenticated with check(public.mc_saas_is_member(business_id) and driver_id=auth.uid());
create policy mc_saas_driver_update on public.mc_saas_driver_locations for update to authenticated using(public.mc_saas_is_member(business_id) and driver_id=auth.uid()) with check(public.mc_saas_is_member(business_id) and driver_id=auth.uid());
create policy mc_saas_domain_owner_read on public.mc_saas_custom_domains for select to authenticated using(public.mc_saas_can_manage(business_id));
create policy mc_saas_domain_owner_insert on public.mc_saas_custom_domains for insert to authenticated with check(public.mc_saas_can_manage(business_id) and verified=false and active=false);
create policy mc_saas_domain_owner_delete on public.mc_saas_custom_domains for delete to authenticated using(public.mc_saas_can_manage(business_id) and verified=false and active=false);
create policy mc_saas_domain_public_read on public.mc_saas_custom_domains for select to anon,authenticated using(verified=true and active=true);

-- Explicit API grants; RLS remains the actual row-level security boundary.
grant select on public.mc_saas_businesses, public.mc_saas_categories, public.mc_saas_products, public.mc_saas_custom_domains to anon, authenticated;
grant update on public.mc_saas_businesses to authenticated;
grant select on public.mc_saas_members to authenticated;
grant select, insert, update, delete on public.mc_saas_categories, public.mc_saas_products, public.mc_saas_quotations, public.mc_saas_custom_domains to authenticated;
grant select, insert, update on public.mc_saas_orders to anon, authenticated;
grant select, insert, update on public.mc_saas_driver_locations to authenticated;
grant usage, select on sequence public.mc_saas_orders_order_number_seq to anon, authenticated;

-- Image storage uses a first-level folder equal to business UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mc-saas-images','mc-saas-images',true,6291456,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists mc_saas_image_upload on storage.objects;
drop policy if exists mc_saas_image_update on storage.objects;
drop policy if exists mc_saas_image_delete on storage.objects;
create policy mc_saas_image_upload on storage.objects for insert to authenticated with check(bucket_id='mc-saas-images' and exists(select 1 from public.mc_saas_members m where m.business_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.role in ('owner','admin','editor')));
create policy mc_saas_image_update on storage.objects for update to authenticated using(bucket_id='mc-saas-images' and exists(select 1 from public.mc_saas_members m where m.business_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.role in ('owner','admin','editor'))) with check(bucket_id='mc-saas-images' and exists(select 1 from public.mc_saas_members m where m.business_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.role in ('owner','admin','editor')));
create policy mc_saas_image_delete on storage.objects for delete to authenticated using(bucket_id='mc-saas-images' and exists(select 1 from public.mc_saas_members m where m.business_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.role in ('owner','admin','editor')));
commit;

-- MANUAL APPROVAL: after reviewing a business, publish it with:
-- update public.mc_saas_businesses set is_published=true where slug='business-slug';
-- CUSTOM DOMAIN: first point DNS to your chosen host; verify DNS/HTTPS outside this SQL, then:
-- update public.mc_saas_custom_domains set verified=true, active=true where domain='shop.example.com';
-- Only platform operators should run the approval statements above. Never expose a service-role key in HTML.

-- Category artwork: safe for existing installations
alter table public.mc_saas_categories add column if not exists image_url text not null default '';
