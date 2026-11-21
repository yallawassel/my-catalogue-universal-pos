-- V16: online orders reduce stock automatically + "ask for the price" for products without a price.

-- 1) Stock movement type for delivered online orders
alter table public.mc_saas_stock_movements drop constraint if exists mc_saas_stock_movements_movement_type_check;
alter table public.mc_saas_stock_movements add constraint mc_saas_stock_movements_movement_type_check
  check (movement_type in ('opening_balance','pos_snapshot','purchase','pos_sale','adjustment','return','online_sale'));

-- 2) When an order is delivered, its reserved stock leaves the shelf: physical stock goes down and the
--    reservation is closed ('reconciled'). POS snapshots and manual counts stay absolute, so nothing is counted twice.
create or replace function public.mc_saas_consume_order_stock(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0;
begin
  for r in select * from public.mc_saas_stock_reservations
            where order_id = p_order_id and status in ('reserved','exception') and product_id is not null and quantity_base is not null
            for update loop
    update public.mc_saas_product_stock set physical_qty_base = greatest(0, physical_qty_base - r.quantity_base), updated_at = now()
     where business_id = r.business_id and product_id = r.product_id and stock_initialized;
    if found then
      insert into public.mc_saas_stock_movements(business_id, product_id, product_unit_id, movement_type, quantity_base, reference_type, reference_id, note)
      values (r.business_id, r.product_id, r.product_unit_id, 'online_sale', -r.quantity_base, 'order', p_order_id::text, 'Online order delivered');
    end if;
    update public.mc_saas_stock_reservations set status = 'reconciled', note = 'Delivered — taken out of stock', updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.mc_saas_consume_order_stock(uuid) from public, anon, authenticated;

create or replace function public.mc_saas_order_reservation_status_change()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if new.order_status = 'cancelled' and old.order_status is distinct from new.order_status then
    update public.mc_saas_stock_reservations set status = 'released', note = 'Order cancelled', updated_at = now()
     where order_id = new.id and status in ('reserved','pending','exception');
  elsif old.order_status = 'cancelled' and new.order_status in ('new','confirmed','preparing','out_for_delivery') then
    perform public.mc_saas_process_order_reservations(new.id);
  end if;
  if new.order_status = 'delivered' and old.order_status is distinct from 'delivered' then
    perform public.mc_saas_consume_order_stock(new.id);
  end if;
  return new;
end $$;

-- 3) One switch for the business: turn automatic stock reduction on/off; turning it on reserves stock for open orders.
create or replace function public.mc_saas_set_auto_stock(p_business_id uuid, p_enabled boolean)
returns integer language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare o record; n integer := 0;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  insert into public.mc_saas_stock_settings(business_id) values (p_business_id) on conflict do nothing;
  update public.mc_saas_stock_settings set reservations_enabled = coalesce(p_enabled,false), updated_at = now() where business_id = p_business_id;
  if p_enabled then
    for o in select id from public.mc_saas_orders where business_id = p_business_id and order_status not in ('delivered','cancelled') loop
      perform public.mc_saas_process_order_reservations(o.id); n := n + 1;
    end loop;
  end if;
  return n;
end $$;
revoke all on function public.mc_saas_set_auto_stock(uuid,boolean) from public, anon;
grant execute on function public.mc_saas_set_auto_stock(uuid,boolean) to authenticated;

-- 4) Quick unit conversion: "1 Box = 12 Packet" for the product's second unit.
create or replace function public.mc_saas_set_unit_conversion(p_business_id uuid, p_unit_id uuid, p_conversion_to_base numeric)
returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_conversion_to_base is null or p_conversion_to_base <= 0 or p_conversion_to_base > 1000000 then raise exception 'Enter a number greater than zero.'; end if;
  update public.mc_saas_product_units set conversion_to_base = p_conversion_to_base, conversion_configured = true, updated_at = now()
   where id = p_unit_id and business_id = p_business_id and not is_base_unit;
  if not found then raise exception 'Unit not found.'; end if;
  return true;
end $$;
revoke all on function public.mc_saas_set_unit_conversion(uuid,uuid,numeric) from public, anon;
grant execute on function public.mc_saas_set_unit_conversion(uuid,uuid,numeric) to authenticated;

-- 5) Orders: products without a price can be ordered as "price on request" (stock checks unchanged).
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
    if v_price is null then
      -- no price yet: the customer asks for the price; the business confirms it
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
        'quantity', v_qty, 'unit_price', null, 'line_total', null, 'price_on_request', true));
    else
      v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
        'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2))
        || case when v_price < v_regular then jsonb_build_object('regular_price', v_regular) else '{}'::jsonb end);
      v_total := v_total + round(v_qty * v_price, 2);
    end if;
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

-- Note: V14/V15 appended a stray {} element to order items (jsonb || precedence). Fixed above with jsonb_build_array();
-- no customer orders were saved in that window, so no data repair was needed.
