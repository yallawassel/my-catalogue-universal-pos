-- V15: stock shown on the catalogue (out of stock / low stock), manual sold-out switch,
-- quick stock counts without a POS, and orders blocked for sold-out products.

-- 1) Per-product manual availability: auto = follow stock numbers
alter table public.mc_saas_products add column if not exists availability text not null default 'auto';
alter table public.mc_saas_products drop constraint if exists mc_saas_products_availability_check;
alter table public.mc_saas_products add constraint mc_saas_products_availability_check check (availability in ('auto','in_stock','out_of_stock'));

-- 2) Catalogue display settings per business
alter table public.mc_saas_stock_settings
  add column if not exists show_on_catalogue boolean not null default true,
  add column if not exists hide_out_of_stock boolean not null default false,
  add column if not exists block_out_of_stock_orders boolean not null default true,
  add column if not exists low_stock_threshold numeric not null default 0,
  add column if not exists show_quantity boolean not null default false;
alter table public.mc_saas_stock_settings drop constraint if exists mc_saas_stock_settings_low_check;
alter table public.mc_saas_stock_settings add constraint mc_saas_stock_settings_low_check check (low_stock_threshold >= 0 and low_stock_threshold <= 100000);
insert into public.mc_saas_stock_settings(business_id) select b.id from public.mc_saas_businesses b on conflict do nothing;

-- 3) One place that decides a product's status: manual switch first, then stock numbers.
create or replace function public.mc_saas_product_status(p_availability text, p_initialized boolean, p_available numeric, p_low numeric)
returns text language sql immutable set search_path = public as $$
  select case
    when p_availability = 'out_of_stock' then 'out_of_stock'
    when p_availability = 'in_stock' then 'in_stock'
    when not coalesce(p_initialized,false) or p_available is null then 'unknown'
    when p_available <= 0 then 'out_of_stock'
    when p_low > 0 and p_available <= p_low then 'low_stock'
    else 'in_stock' end
$$;

-- 4) Public, safe read for the catalogue: only published businesses, only what the owner chose to show.
create or replace function public.mc_saas_public_stock(p_business_id uuid)
returns table(product_id uuid, status text, qty numeric)
language sql stable security definer set search_path = public as $$
  with st as (
    select coalesce(s.show_on_catalogue,true) show_on, coalesce(s.low_stock_threshold,0) low, coalesce(s.show_quantity,false) show_qty
      from public.mc_saas_businesses b left join public.mc_saas_stock_settings s on s.business_id = b.id
     where b.id = p_business_id and b.is_published
  )
  select p.id,
         public.mc_saas_product_status(p.availability, a.stock_initialized, a.available_qty_base, st.low),
         case when st.show_qty and p.availability = 'auto' and a.stock_initialized then floor(a.available_qty_base) end
    from st
    join public.mc_saas_products p on p.business_id = p_business_id and p.is_active
    left join public.mc_saas_stock_availability a on a.product_id = p.id and a.business_id = p_business_id
   where st.show_on or p.availability = 'out_of_stock'
$$;
revoke all on function public.mc_saas_public_stock(uuid) from public;
grant execute on function public.mc_saas_public_stock(uuid) to anon, authenticated;

create or replace function public.mc_saas_public_stock_settings(p_business_id uuid)
returns table(show_on_catalogue boolean, hide_out_of_stock boolean, block_out_of_stock_orders boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(s.show_on_catalogue,true), coalesce(s.hide_out_of_stock,false), coalesce(s.block_out_of_stock_orders,true)
    from public.mc_saas_businesses b left join public.mc_saas_stock_settings s on s.business_id = b.id
   where b.id = p_business_id and b.is_published
$$;
revoke all on function public.mc_saas_public_stock_settings(uuid) from public;
grant execute on function public.mc_saas_public_stock_settings(uuid) to anon, authenticated;

-- 5) Quick stock count for businesses without a POS (or to correct a count). Records a movement.
create or replace function public.mc_saas_set_stock_count(p_business_id uuid, p_product_id uuid, p_quantity_base numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_old numeric;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_quantity_base is null or p_quantity_base < 0 or p_quantity_base > 100000000 then raise exception 'Stock must be zero or greater.'; end if;
  if not exists (select 1 from public.mc_saas_products where id = p_product_id and business_id = p_business_id) then raise exception 'Product not found in this business.'; end if;
  insert into public.mc_saas_product_stock(business_id, product_id) values (p_business_id, p_product_id) on conflict do nothing;
  select case when stock_initialized then physical_qty_base else 0 end into v_old
    from public.mc_saas_product_stock where business_id = p_business_id and product_id = p_product_id for update;
  update public.mc_saas_product_stock set physical_qty_base = p_quantity_base, stock_initialized = true, updated_at = now()
   where business_id = p_business_id and product_id = p_product_id;
  insert into public.mc_saas_stock_movements(business_id, product_id, movement_type, quantity_base, reference_type, note, created_by)
  values (p_business_id, p_product_id, 'adjustment', p_quantity_base - coalesce(v_old,0), 'manual_count',
          coalesce(nullif(trim(p_note),''), 'Stock count set to ' || p_quantity_base), auth.uid());
  return p_quantity_base;
end $$;
revoke all on function public.mc_saas_set_stock_count(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.mc_saas_set_stock_count(uuid,uuid,numeric,text) to authenticated;

-- 6) Manual sold-out / available switch (also for staff who can manage products).
create or replace function public.mc_saas_set_product_availability(p_business_id uuid, p_product_ids uuid[], p_availability text)
returns integer language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare n integer;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_availability not in ('auto','in_stock','out_of_stock') then raise exception 'Invalid availability.'; end if;
  update public.mc_saas_products set availability = p_availability, updated_at = now()
   where business_id = p_business_id and id = any(coalesce(p_product_ids,'{}'));
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.mc_saas_set_product_availability(uuid,uuid[],text) from public, anon;
grant execute on function public.mc_saas_set_product_availability(uuid,uuid[],text) to authenticated;

-- 7) Orders: refuse sold-out products and quantities above what is left (when stock and unit conversion are known).
create or replace function public.mc_saas_orders_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_biz record; v_p record; it jsonb; v_id text; v_qty numeric; v_unit int; v_price numeric; v_regular numeric; v_label text;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_recent int;
  v_block boolean; v_init boolean; v_avail numeric; v_conv numeric; v_need numeric; v_needs jsonb := '{}'::jsonb;
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
      when it->>'unit_index' = '1' and v_p.price1 is not null then 1
      when it->>'unit_index' = '2' and v_p.price2 is not null then 2
      when it->>'unit' = coalesce(nullif(v_p.label1, ''), 'Packet') and v_p.price1 is not null then 1
      when it->>'unit' = coalesce(nullif(v_p.label2, ''), 'Box') and v_p.price2 is not null then 2
      when v_p.price1 is not null then 1 else 2 end;
    v_regular := case when v_unit = 1 then v_p.price1 else v_p.price2 end;
    v_price := case when v_unit = 1 then public.mc_saas_effective_price(v_p.price1, v_p.sale_price1, v_p.sale_ends_at)
                    else public.mc_saas_effective_price(v_p.price2, v_p.sale_price2, v_p.sale_ends_at) end;
    if v_price is null then raise exception '% has no price yet.', v_p.name; end if;
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
    v_items := v_items || jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
      'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2))
      || case when v_price < v_regular then jsonb_build_object('regular_price', v_regular) else '{}'::jsonb end;
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  new.items := v_items; new.subtotal := v_total; new.total := v_total; new.currency := coalesce(v_biz.currency, 'USD');
  new.order_status := 'new'; new.payment_status := 'unpaid'; new.created_at := now(); new.updated_at := now();
  new.customer_name := left(trim(new.customer_name), 160); new.customer_phone := left(trim(new.customer_phone), 40);
  new.delivery_address := left(coalesce(new.delivery_address, ''), 600); new.notes := left(coalesce(new.notes, ''), 1000);
  if new.delivery_lat is not null and (new.delivery_lat not between -90 and 90 or new.delivery_lng is null or new.delivery_lng not between -180 and 180) then
    new.delivery_lat := null; new.delivery_lng := null; new.location_shared := false;
  end if;
  return new;
end $function$;
