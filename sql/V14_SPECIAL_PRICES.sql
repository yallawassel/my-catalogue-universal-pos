-- V14: special (sale) prices. price1/price2 stay the regular prices (POS sync keeps updating them);
-- sale_price1/sale_price2 are the discounted prices, optionally until sale_ends_at.
alter table public.mc_saas_products
  add column if not exists sale_price1 numeric,
  add column if not exists sale_price2 numeric,
  add column if not exists sale_ends_at timestamptz;
alter table public.mc_saas_products drop constraint if exists mc_saas_products_sale_check;
alter table public.mc_saas_products add constraint mc_saas_products_sale_check check (coalesce(sale_price1,0) >= 0 and coalesce(sale_price2,0) >= 0);

-- The price a customer pays: the sale price while the offer is running and lower than the regular price.
create or replace function public.mc_saas_effective_price(p_regular numeric, p_sale numeric, p_ends timestamptz)
returns numeric language sql stable set search_path = public as $$
  select case when p_regular is not null and p_sale is not null and p_sale < p_regular and (p_ends is null or p_ends > now())
              then p_sale else p_regular end
$$;

create or replace function public.mc_saas_orders_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_biz record; v_p record; it jsonb; v_id text; v_qty numeric; v_unit int; v_price numeric; v_regular numeric; v_label text;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_recent int;
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
  for it in select value from jsonb_array_elements(new.items) loop
    v_id := it->>'product_id';
    if v_id is null or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Your cart contains an unknown product. Please refresh the catalogue.';
    end if;
    select id, name, label1, price1, label2, price2, sale_price1, sale_price2, sale_ends_at, is_active into v_p
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
