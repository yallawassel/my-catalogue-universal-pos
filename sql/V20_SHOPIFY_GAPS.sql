-- V20: closing the gaps with Shopify — Arabic content, more photos, product options, delivery zones & fees,
-- discount codes, payment instructions/link, customer order tracking, storefront analytics, nightly backups.

-- 1) Products & categories: Arabic text, extra photos, options (e.g. Size: S, M, L)
alter table public.mc_saas_products add column if not exists name_ar text;
alter table public.mc_saas_products add column if not exists description_ar text;
alter table public.mc_saas_products add column if not exists images text[] not null default '{}';
alter table public.mc_saas_products add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.mc_saas_products drop constraint if exists mc_saas_products_extras_check;
alter table public.mc_saas_products add constraint mc_saas_products_extras_check check (coalesce(array_length(images,1),0) <= 12 and jsonb_typeof(options) = 'array' and length(options::text) <= 4000);
alter table public.mc_saas_categories add column if not exists name_ar text;
grant select (name_ar) on public.mc_saas_categories to anon, authenticated;

-- 2) Business: language, Arabic description, payment instructions/link, pickup
alter table public.mc_saas_businesses add column if not exists default_language text not null default 'en';
alter table public.mc_saas_businesses drop constraint if exists mc_saas_businesses_lang_check;
alter table public.mc_saas_businesses add constraint mc_saas_businesses_lang_check check (default_language in ('en','ar'));
alter table public.mc_saas_businesses add column if not exists description_ar text;
alter table public.mc_saas_businesses add column if not exists pay_methods jsonb not null default '{}'::jsonb;  -- {"whish":"…","omt":"…","bank":"…","link":"https://…","note":"…"}
alter table public.mc_saas_businesses add column if not exists pickup_enabled boolean not null default true;
alter table public.mc_saas_businesses add column if not exists pickup_address text;
grant select (default_language, description_ar, pay_methods, pickup_enabled, pickup_address) on public.mc_saas_businesses to anon, authenticated;

-- 3) Delivery zones
create table if not exists public.mc_saas_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80), name_ar text,
  fee numeric not null default 0 check (fee >= 0), free_over numeric check (free_over is null or free_over >= 0),
  min_order numeric check (min_order is null or min_order >= 0), eta text,
  sort_order integer not null default 0, is_active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists mc_saas_delivery_zones_biz on public.mc_saas_delivery_zones(business_id, sort_order);
alter table public.mc_saas_delivery_zones enable row level security;
revoke all on public.mc_saas_delivery_zones from anon, authenticated;
grant select on public.mc_saas_delivery_zones to anon, authenticated;
grant insert, update, delete on public.mc_saas_delivery_zones to authenticated;
drop policy if exists mc_saas_delivery_zones_read on public.mc_saas_delivery_zones;
create policy mc_saas_delivery_zones_read on public.mc_saas_delivery_zones for select to anon, authenticated
  using ((is_active and exists (select 1 from public.mc_saas_businesses b where b.id = business_id and b.is_published)) or public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_delivery_zones_write on public.mc_saas_delivery_zones;
create policy mc_saas_delivery_zones_write on public.mc_saas_delivery_zones for all to authenticated using (public.mc_saas_can_manage(business_id)) with check (public.mc_saas_can_manage(business_id));

-- 4) Discount codes (checked by the server; customers can't read the list)
create table if not exists public.mc_saas_discount_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{2,30}$'),
  kind text not null default 'percent' check (kind in ('percent','amount','free_delivery')),
  value numeric not null default 0 check (value >= 0),
  min_order numeric check (min_order is null or min_order >= 0),
  starts_at timestamptz, ends_at timestamptz, max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0, is_active boolean not null default true, created_at timestamptz not null default now(),
  unique (business_id, code)
);
alter table public.mc_saas_discount_codes enable row level security;
revoke all on public.mc_saas_discount_codes from anon, authenticated;
grant select, insert, update, delete on public.mc_saas_discount_codes to authenticated;
drop policy if exists mc_saas_discount_codes_manage on public.mc_saas_discount_codes;
create policy mc_saas_discount_codes_manage on public.mc_saas_discount_codes for all to authenticated using (public.mc_saas_can_manage(business_id)) with check (public.mc_saas_can_manage(business_id));

create or replace function public.mc_saas_check_discount(p_business_id uuid, p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d public.mc_saas_discount_codes; v numeric;
begin
  if not exists (select 1 from public.mc_saas_businesses where id = p_business_id and is_published) then return jsonb_build_object('ok', false, 'message', 'Not available.'); end if;
  select * into d from public.mc_saas_discount_codes where business_id = p_business_id and code = upper(trim(coalesce(p_code,'')));
  if d.id is null or not d.is_active or (d.starts_at is not null and d.starts_at > now()) or (d.ends_at is not null and d.ends_at < now()) or (d.max_uses is not null and d.used_count >= d.max_uses) then
    return jsonb_build_object('ok', false, 'message', 'This discount code is not valid.'); end if;
  if d.min_order is not null and coalesce(p_subtotal,0) < d.min_order then return jsonb_build_object('ok', false, 'message', 'Needs an order of at least ' || d.min_order, 'min_order', d.min_order); end if;
  v := case d.kind when 'percent' then round(coalesce(p_subtotal,0) * least(d.value,100) / 100, 2) when 'amount' then least(d.value, coalesce(p_subtotal,0)) else 0 end;
  return jsonb_build_object('ok', true, 'code', d.code, 'kind', d.kind, 'value', d.value, 'amount', v);
end $$;
revoke all on function public.mc_saas_check_discount(uuid,text,numeric) from public;
grant execute on function public.mc_saas_check_discount(uuid,text,numeric) to anon, authenticated;

-- 5) Orders: delivery, discount, payment method, language, tracking token
alter table public.mc_saas_orders add column if not exists delivery_zone_id uuid references public.mc_saas_delivery_zones(id) on delete set null;
alter table public.mc_saas_orders add column if not exists delivery_zone text;
alter table public.mc_saas_orders add column if not exists delivery_fee numeric not null default 0;
alter table public.mc_saas_orders add column if not exists discount_code text;
alter table public.mc_saas_orders add column if not exists discount_amount numeric not null default 0;
alter table public.mc_saas_orders add column if not exists payment_method text;
alter table public.mc_saas_orders add column if not exists language text;
alter table public.mc_saas_orders add column if not exists public_token uuid default gen_random_uuid();
grant insert (delivery_zone_id, discount_code, payment_method, language, public_token) on public.mc_saas_orders to anon, authenticated;

-- customers follow their order with the id + secret token from the confirmation link
create or replace function public.mc_saas_track_order(p_order_id uuid, p_token uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('order_number', o.order_number, 'status', o.order_status, 'payment_status', o.payment_status, 'created_at', o.created_at,
    'updated_at', o.updated_at, 'items', o.items, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'delivery_zone', o.delivery_zone,
    'discount_amount', o.discount_amount, 'discount_code', o.discount_code, 'total', o.total, 'currency', o.currency, 'customer_name', o.customer_name,
    'business', jsonb_build_object('company_name', b.company_name, 'slug', b.slug, 'whatsapp', b.whatsapp, 'logo_url', b.logo_url, 'primary_color', b.primary_color, 'pay_methods', b.pay_methods))
  from public.mc_saas_orders o join public.mc_saas_businesses b on b.id = o.business_id
  where o.id = p_order_id and o.public_token = p_token
$$;
revoke all on function public.mc_saas_track_order(uuid,uuid) from public;
grant execute on function public.mc_saas_track_order(uuid,uuid) to anon, authenticated;

-- 6) Storefront analytics (anonymous, rate-limited)
create table if not exists public.mc_saas_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  kind text not null check (kind in ('visit','product_view','add_to_cart','checkout','order','search')),
  product_id uuid, session text, ref text, created_at timestamptz not null default now()
);
create index if not exists mc_saas_events_biz_date on public.mc_saas_events(business_id, created_at desc);
create index if not exists mc_saas_events_session on public.mc_saas_events(session, created_at desc);
alter table public.mc_saas_events enable row level security;
revoke all on public.mc_saas_events from anon, authenticated;
grant select on public.mc_saas_events to authenticated;
drop policy if exists mc_saas_events_read on public.mc_saas_events;
create policy mc_saas_events_read on public.mc_saas_events for select to authenticated using (public.mc_saas_can_manage(business_id));

create or replace function public.mc_saas_track(p_business_id uuid, p_kind text, p_product_id uuid default null, p_session text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kind not in ('visit','product_view','add_to_cart','checkout','order','search') or coalesce(length(p_session),0) not between 8 and 64 then return; end if;
  if not exists (select 1 from public.mc_saas_businesses where id = p_business_id and is_published) then return; end if;
  if (select count(*) from public.mc_saas_events where session = p_session and created_at > now() - interval '1 hour') >= 300 then return; end if;
  if p_kind = 'visit' and exists (select 1 from public.mc_saas_events where session = p_session and business_id = p_business_id and kind = 'visit' and created_at > now() - interval '30 minutes') then return; end if;
  insert into public.mc_saas_events(business_id, kind, product_id, session, ref)
  values (p_business_id, p_kind, case when p_product_id is not null and exists (select 1 from public.mc_saas_products where id = p_product_id and business_id = p_business_id) then p_product_id end,
          left(p_session, 64), left(nullif(p_ref,''), 120));
end $$;
revoke all on function public.mc_saas_track(uuid,text,uuid,text,text) from public;
grant execute on function public.mc_saas_track(uuid,text,uuid,text,text) to anon, authenticated;

create or replace function public.mc_saas_analytics(p_business_id uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days,30), 366))); r jsonb;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  select jsonb_build_object(
    'visits', count(*) filter (where kind = 'visit'),
    'visitors', count(distinct session) filter (where kind = 'visit'),
    'product_views', count(*) filter (where kind = 'product_view'),
    'add_to_cart', count(*) filter (where kind = 'add_to_cart'),
    'checkouts', count(*) filter (where kind = 'checkout'),
    'orders', (select count(*) from public.mc_saas_orders o where o.business_id = p_business_id and o.created_at >= since),
    'revenue', (select coalesce(sum(total),0) from public.mc_saas_orders o where o.business_id = p_business_id and o.created_at >= since and o.order_status <> 'cancelled'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visits', v) order by d), '[]') from (select created_at::date d, count(*) v from public.mc_saas_events where business_id = p_business_id and kind = 'visit' and created_at >= since group by 1) x),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'views', v) order by v desc), '[]') from (select e.product_id, p.name, count(*) v from public.mc_saas_events e join public.mc_saas_products p on p.id = e.product_id where e.business_id = p_business_id and e.kind = 'product_view' and e.created_at >= since group by 1,2 order by 3 desc limit 10) y),
    'top_sources', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'visits', v) order by v desc), '[]') from (select coalesce(ref,'Direct / WhatsApp') ref, count(*) v from public.mc_saas_events where business_id = p_business_id and kind = 'visit' and created_at >= since group by 1 order by 2 desc limit 8) z),
    'top_searches', (select coalesce(jsonb_agg(jsonb_build_object('q', ref, 'n', v) order by v desc), '[]') from (select lower(ref) ref, count(*) v from public.mc_saas_events where business_id = p_business_id and kind = 'search' and ref is not null and created_at >= since group by 1 order by 2 desc limit 10) w)
  ) into r from public.mc_saas_events where business_id = p_business_id and created_at >= since;
  return r;
end $$;
revoke all on function public.mc_saas_analytics(uuid,integer) from public, anon;
grant execute on function public.mc_saas_analytics(uuid,integer) to authenticated;

-- 7) Order trigger with options, delivery fee and discount
create or replace function public.mc_saas_orders_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_biz record; v_p record; it jsonb; v_id text; v_qty numeric; v_unit int; v_price numeric; v_regular numeric; v_label text;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_recent int;
  v_block boolean; v_init boolean; v_avail numeric; v_conv numeric; v_need numeric; v_needs jsonb := '{}'::jsonb;
  v_opts text; v_zone public.mc_saas_delivery_zones; v_fee numeric := 0; v_dc public.mc_saas_discount_codes; v_disc numeric := 0; v_code text;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.mc_saas_can_manage(new.business_id) then return new; end if;
  select id, currency, is_published into v_biz from public.mc_saas_businesses where id = new.business_id;
  if not found or not v_biz.is_published then raise exception 'This catalogue is not accepting orders.'; end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 200 then
    raise exception 'An order must contain between 1 and 200 items.';
  end if;
  select count(*) into v_recent from public.mc_saas_orders
   where business_id = new.business_id and customer_phone = trim(new.customer_phone) and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then raise exception 'Too many orders from this phone number. Please wait a few minutes.'; end if;
  select count(*) into v_recent from public.mc_saas_orders
   where business_id = new.business_id and created_at > now() - interval '1 minute';
  if v_recent >= 30 then raise exception 'This catalogue is receiving many orders right now. Please try again in a minute.'; end if;
  select coalesce(s.block_out_of_stock_orders, true) into v_block from public.mc_saas_stock_settings s where s.business_id = new.business_id;
  v_block := coalesce(v_block, true);
  for it in select value from jsonb_array_elements(new.items) loop
    v_id := it->>'product_id';
    if v_id is null or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Your cart contains an unknown product. Please refresh the catalogue.';
    end if;
    select id, name, label1, price1, label2, price2, sale_price1, sale_price2, sale_ends_at, availability, is_active into v_p
      from public.mc_saas_products where id = v_id::uuid and business_id = new.business_id;
    if not found or not v_p.is_active then raise exception 'A product in your cart is no longer available. Please refresh the catalogue.'; end if;
    if coalesce(it->>'quantity', '') !~ '^\d{1,6}(\.\d+)?$' then raise exception 'Invalid quantity for %.', v_p.name; end if;
    v_qty := floor((it->>'quantity')::numeric);
    if v_qty < 1 or v_qty > 100000 then raise exception 'Invalid quantity for %.', v_p.name; end if;
    v_unit := case
      when v_p.price1 is null and v_p.price2 is null then case when it->>'unit_index' = '2' and coalesce(trim(v_p.label2), '') <> '' then 2 else 1 end
      when it->>'unit_index' = '1' and v_p.price1 is not null then 1
      when it->>'unit_index' = '2' and v_p.price2 is not null then 2
      when it->>'unit' = coalesce(nullif(v_p.label1, ''), 'Packet') and v_p.price1 is not null then 1
      when it->>'unit' = coalesce(nullif(v_p.label2, ''), 'Box') and v_p.price2 is not null then 2
      when v_p.price1 is not null then 1 else 2 end;
    v_regular := case when v_unit = 1 then v_p.price1 else v_p.price2 end;
    v_price := case when v_unit = 1 then public.mc_saas_effective_price(v_p.price1, v_p.sale_price1, v_p.sale_ends_at)
                    else public.mc_saas_effective_price(v_p.price2, v_p.sale_price2, v_p.sale_ends_at) end;
    v_label := case when v_unit = 1 then coalesce(nullif(v_p.label1, ''), 'Packet') else coalesce(nullif(v_p.label2, ''), 'Box') end;
    if v_block then
      v_init := null; v_avail := null; v_conv := null;
      select a.stock_initialized, a.available_qty_base into v_init, v_avail
        from public.mc_saas_stock_availability a where a.business_id = new.business_id and a.product_id = v_p.id;
      if public.mc_saas_product_status(v_p.availability, v_init, v_avail, 0) = 'out_of_stock' then
        raise exception '% is out of stock. Please remove it from your cart.', v_p.name;
      end if;
      if v_p.availability = 'auto' and coalesce(v_init, false) then
        select u.conversion_to_base into v_conv from public.mc_saas_product_units u
         where u.business_id = new.business_id and u.product_id = v_p.id and u.is_active
           and lower(trim(u.unit_name)) = lower(trim(v_label)) and (u.is_base_unit or u.conversion_configured)
         order by u.is_base_unit desc limit 1;
        if v_conv is not null and v_conv > 0 then
          v_need := coalesce((v_needs->>v_p.id::text)::numeric, 0) + v_qty * v_conv;
          v_needs := v_needs || jsonb_build_object(v_p.id::text, v_need);
          if v_need > v_avail then
            raise exception 'Only % % of % left in stock. Please lower the quantity.', floor(v_avail / v_conv), v_label, v_p.name;
          end if;
        end if;
      end if;
    end if;
    v_opts := nullif(left(regexp_replace(coalesce(it->>'options',''), '[\r\n<>]', ' ', 'g'), 200), '');
    if v_price is null then
      -- no price yet: the customer asks for the price; the business confirms it
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
        'quantity', v_qty, 'unit_price', null, 'line_total', null, 'price_on_request', true) || case when v_opts is not null then jsonb_build_object('options', v_opts) else '{}'::jsonb end);
    else
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
        'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2))
        || case when v_price < v_regular then jsonb_build_object('regular_price', v_regular) else '{}'::jsonb end
        || case when v_opts is not null then jsonb_build_object('options', v_opts) else '{}'::jsonb end);
      v_total := v_total + round(v_qty * v_price, 2);
    end if;
  end loop;
  -- delivery zone fee (chosen zone must belong to this business and be active)
  new.delivery_fee := 0; new.delivery_zone := null;
  if new.delivery_zone_id is not null then
    select * into v_zone from public.mc_saas_delivery_zones where id = new.delivery_zone_id and business_id = new.business_id and is_active;
    if v_zone.id is null then raise exception 'Please choose your delivery area again.'; end if;
    if v_zone.min_order is not null and v_total < v_zone.min_order then raise exception 'The minimum order for % is % %.', v_zone.name, v_zone.min_order, coalesce(v_biz.currency, 'USD'); end if;
    v_fee := case when v_zone.free_over is not null and v_total >= v_zone.free_over then 0 else coalesce(v_zone.fee, 0) end;
    new.delivery_zone := v_zone.name;
  end if;
  -- discount code
  new.discount_amount := 0;
  v_code := upper(nullif(trim(coalesce(new.discount_code, '')), ''));
  new.discount_code := v_code;
  if v_code is not null then
    select * into v_dc from public.mc_saas_discount_codes where business_id = new.business_id and code = v_code for update;
    if v_dc.id is null or not v_dc.is_active or (v_dc.starts_at is not null and v_dc.starts_at > now()) or (v_dc.ends_at is not null and v_dc.ends_at < now())
       or (v_dc.max_uses is not null and v_dc.used_count >= v_dc.max_uses) then raise exception 'This discount code is not valid.'; end if;
    if v_dc.min_order is not null and v_total < v_dc.min_order then raise exception 'This discount code needs an order of at least % %.', v_dc.min_order, coalesce(v_biz.currency, 'USD'); end if;
    v_disc := case v_dc.kind when 'percent' then round(v_total * least(v_dc.value, 100) / 100, 2) when 'amount' then least(v_dc.value, v_total) else 0 end;
    if v_dc.kind = 'free_delivery' then v_fee := 0; end if;
    update public.mc_saas_discount_codes set used_count = used_count + 1 where id = v_dc.id;
    new.discount_amount := v_disc;
  end if;
  new.delivery_fee := v_fee;
  new.payment_method := left(nullif(trim(coalesce(new.payment_method, '')), ''), 30);
  new.language := case when new.language in ('en','ar') then new.language else 'en' end;
  new.public_token := coalesce(new.public_token, gen_random_uuid());
  new.items := v_items; new.subtotal := v_total; new.total := round(v_total - v_disc + v_fee, 2); new.currency := coalesce(v_biz.currency, 'USD');
  new.order_status := 'new'; new.payment_status := 'unpaid'; new.created_at := now(); new.updated_at := now();
  new.customer_name := left(trim(new.customer_name), 160); new.customer_phone := left(trim(new.customer_phone), 40);
  new.delivery_address := left(coalesce(new.delivery_address, ''), 600); new.notes := left(coalesce(new.notes, ''), 1000);
  if new.delivery_lat is not null and (new.delivery_lat not between -90 and 90 or new.delivery_lng is null or new.delivery_lng not between -180 and 180) then
    new.delivery_lat := null; new.delivery_lng := null; new.location_shared := false;
  end if;
  return new;
end $function$;


-- 8) Nightly backups inside the database (14 days kept), on top of Supabase's own backups
create schema if not exists mc_backup;
create table if not exists mc_backup.daily_snapshots (
  snapshot_date date not null, business_id uuid not null, table_name text not null, row_count integer not null, data jsonb not null,
  created_at timestamptz not null default now(), primary key (snapshot_date, business_id, table_name)
);
revoke all on schema mc_backup from public, anon, authenticated;
revoke all on mc_backup.daily_snapshots from public, anon, authenticated;
create or replace function public.mc_saas_nightly_backup()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare t text; n integer := 0; d date := current_date;
  tables text[] := array['mc_saas_products','mc_saas_categories','mc_saas_product_units','mc_saas_product_stock','mc_saas_pos_customers','mc_saas_pos_settings',
                         'mc_saas_delivery_zones','mc_saas_discount_codes','mc_saas_stock_settings'];
begin
  delete from mc_backup.daily_snapshots where snapshot_date = d;
  foreach t in array tables loop
    execute format('insert into mc_backup.daily_snapshots(snapshot_date, business_id, table_name, row_count, data)
      select %L, business_id, %L, count(*), jsonb_agg(to_jsonb(x)) from public.%I x group by business_id', d, t, t);
    n := n + 1;
  end loop;
  insert into mc_backup.daily_snapshots(snapshot_date, business_id, table_name, row_count, data)
    select d, business_id, 'mc_saas_orders(60d)', count(*), jsonb_agg(to_jsonb(o)) from public.mc_saas_orders o where created_at > now() - interval '60 days' group by business_id;
  insert into mc_backup.daily_snapshots(snapshot_date, business_id, table_name, row_count, data)
    select d, business_id, 'mc_saas_pos_sales(60d)', count(*), jsonb_agg(to_jsonb(s)) from public.mc_saas_pos_sales s where created_at > now() - interval '60 days' group by business_id;
  delete from mc_backup.daily_snapshots where snapshot_date < d - 14;
  return n + 2;
end $$;
revoke all on function public.mc_saas_nightly_backup() from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('mc-nightly-backup', '30 1 * * *', 'select public.mc_saas_nightly_backup()');

-- 9) Admin RPCs: shop settings, Arabic category names, "download all my data" (applied as v20c)
create or replace function public.mc_saas_save_shop_settings(p_business_id uuid, p_default_language text, p_description_ar text, p_pay_methods jsonb, p_pickup_enabled boolean, p_pickup_address text)
returns void language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare pm jsonb := '{}'::jsonb; k text;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  foreach k in array array['whish','omt','bank','link','note'] loop
    if nullif(trim(coalesce(p_pay_methods->>k,'')),'') is not null then pm := pm || jsonb_build_object(k, left(trim(p_pay_methods->>k), 300)); end if;
  end loop;
  if pm ? 'link' and pm->>'link' !~* '^https://' then raise exception 'The payment link must start with https://'; end if;
  update public.mc_saas_businesses set default_language = case when p_default_language = 'ar' then 'ar' else 'en' end,
    description_ar = nullif(left(trim(coalesce(p_description_ar,'')), 500), ''), pay_methods = pm,
    pickup_enabled = coalesce(p_pickup_enabled, true), pickup_address = nullif(left(trim(coalesce(p_pickup_address,'')), 200), ''), updated_at = now()
  where id = p_business_id;
end $$;
revoke all on function public.mc_saas_save_shop_settings(uuid,text,text,jsonb,boolean,text) from public, anon;
grant execute on function public.mc_saas_save_shop_settings(uuid,text,text,jsonb,boolean,text) to authenticated;

create or replace function public.mc_saas_set_category_ar(p_business_id uuid, p_name text, p_name_ar text)
returns void language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  insert into public.mc_saas_categories(business_id, name, name_ar) values (p_business_id, trim(p_name), nullif(left(trim(coalesce(p_name_ar,'')),80),''))
  on conflict (business_id, name) do update set name_ar = excluded.name_ar;
end $$;
revoke all on function public.mc_saas_set_category_ar(uuid,text,text) from public, anon;
grant execute on function public.mc_saas_set_category_ar(uuid,text,text) to authenticated;

create or replace function public.mc_saas_export_my_data(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare r jsonb := '{}'::jsonb; t text; v jsonb;
  tables text[] := array['mc_saas_products','mc_saas_categories','mc_saas_product_units','mc_saas_product_stock','mc_saas_orders','mc_saas_delivery_zones','mc_saas_discount_codes',
                         'mc_saas_pos_customers','mc_saas_pos_sales','mc_saas_pos_payments','mc_saas_pos_shifts','mc_saas_pos_cash_entries','mc_saas_pos_settings','mc_saas_stock_settings'];
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  select to_jsonb(b) - 'owner_id' into v from public.mc_saas_businesses b where id = p_business_id; r := r || jsonb_build_object('business', v);
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where business_id = $1', t) into v using p_business_id;
      r := r || jsonb_build_object(t, v);
    end if;
  end loop;
  return r || jsonb_build_object('exported_at', now());
end $$;
revoke all on function public.mc_saas_export_my_data(uuid) from public, anon;
grant execute on function public.mc_saas_export_my_data(uuid) to authenticated;
