-- My Catalogue Universal POS: Hybrid stock + product units
-- ADDITIVE migration for the EXISTING My Catalogue Supabase project only.
-- Do NOT run in White Pack's separate Supabase project.
-- Does not delete or rewrite existing products, orders, prices, images or customers.
-- Take a Supabase backup before running. Run this file once in SQL Editor.

begin;
create extension if not exists pgcrypto;

-- One stock policy row per business. Reservation enforcement starts DISABLED
-- until the business configures unit conversions and imports opening/POS stock.
create table if not exists public.mc_saas_stock_settings (
  business_id uuid primary key references public.mc_saas_businesses(id) on delete cascade,
  reservations_enabled boolean not null default false,
  stock_source text not null default 'hybrid' check (stock_source in ('hybrid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A product can have many sellable units, each with its own barcode and price.
-- conversion_to_base means: 1 of this unit = N base units.
create table if not exists public.mc_saas_product_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  product_id uuid not null references public.mc_saas_products(id) on delete cascade,
  unit_name text not null,
  conversion_to_base numeric(18,6) not null default 1 check (conversion_to_base > 0),
  is_base_unit boolean not null default false,
  conversion_configured boolean not null default false,
  barcode text not null default '',
  pos_unit_id text not null default '',
  selling_price numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mc_saas_product_units_name_nonempty check (length(trim(unit_name)) between 1 and 80),
  constraint mc_saas_product_units_price_nonnegative check (selling_price is null or selling_price >= 0),
  constraint mc_saas_product_units_base_factor check (not is_base_unit or (conversion_to_base = 1 and conversion_configured = true)),
  constraint mc_saas_product_units_business_id_id_key unique (business_id,id)
);
create unique index if not exists mc_saas_product_units_product_name_key
  on public.mc_saas_product_units(business_id,product_id,lower(trim(unit_name)));
create unique index if not exists mc_saas_product_units_one_base_key
  on public.mc_saas_product_units(business_id,product_id) where is_base_unit;
create unique index if not exists mc_saas_product_units_barcode_key
  on public.mc_saas_product_units(business_id,lower(trim(barcode))) where trim(barcode) <> '';
create index if not exists mc_saas_product_units_product_idx
  on public.mc_saas_product_units(business_id,product_id,is_active);

-- Physical quantity is always stored in the product's base unit.
-- stock_initialized=false means unknown, NOT zero stock.
create table if not exists public.mc_saas_product_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  product_id uuid not null references public.mc_saas_products(id) on delete cascade,
  physical_qty_base numeric(18,6) not null default 0 check (physical_qty_base >= 0),
  stock_initialized boolean not null default false,
  last_pos_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (business_id,product_id)
);

create table if not exists public.mc_saas_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  order_id uuid not null references public.mc_saas_orders(id) on delete cascade,
  order_line_no integer not null check (order_line_no > 0),
  product_id uuid references public.mc_saas_products(id) on delete set null,
  product_unit_id uuid references public.mc_saas_product_units(id) on delete set null,
  unit_name text not null default '',
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  conversion_to_base numeric(18,6),
  quantity_base numeric(18,6),
  status text not null default 'pending' check (status in ('pending','reserved','released','reconciled','exception')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id,order_line_no)
);
create index if not exists mc_saas_stock_reservations_active_idx
  on public.mc_saas_stock_reservations(business_id,product_id,status) where status in ('reserved','exception');
create index if not exists mc_saas_stock_reservations_order_idx
  on public.mc_saas_stock_reservations(business_id,order_id);

create table if not exists public.mc_saas_stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  product_id uuid references public.mc_saas_products(id) on delete set null,
  product_unit_id uuid references public.mc_saas_product_units(id) on delete set null,
  movement_type text not null check (movement_type in ('opening_balance','pos_snapshot','purchase','pos_sale','adjustment','return')),
  quantity_base numeric(18,6) not null,
  reference_type text not null default '',
  reference_id text not null default '',
  external_event_id text not null default '',
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists mc_saas_stock_movements_product_idx
  on public.mc_saas_stock_movements(business_id,product_id,created_at desc);

create table if not exists public.mc_saas_pos_unit_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  source_type text not null check (source_type in ('file','api','local_connector','manual')),
  external_product_id text not null,
  external_unit_id text not null default '',
  product_id uuid not null references public.mc_saas_products(id) on delete cascade,
  product_unit_id uuid not null references public.mc_saas_product_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,source_type,external_product_id,external_unit_id)
);

create table if not exists public.mc_saas_stock_sync_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  source_type text not null check (source_type in ('file','api','local_connector','manual')),
  external_event_id text not null,
  event_type text not null check (event_type in ('stock_snapshot','order_sale_reconciliation')),
  status text not null default 'received' check (status in ('received','processed','duplicate','failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (business_id,source_type,external_event_id,event_type)
);
create index if not exists mc_saas_stock_sync_events_business_created
  on public.mc_saas_stock_sync_events(business_id,created_at desc);

create or replace function public.mc_saas_validate_pos_unit_mapping()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(
    select 1 from public.mc_saas_product_units u
    where u.id=new.product_unit_id and u.product_id=new.product_id and u.business_id=new.business_id
  ) then
    raise exception 'POS mapping product, unit and business must refer to the same catalogue product.';
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_pos_unit_mapping_validate on public.mc_saas_pos_unit_mappings;
create trigger mc_saas_pos_unit_mapping_validate
before insert or update on public.mc_saas_pos_unit_mappings
for each row execute function public.mc_saas_validate_pos_unit_mapping();

-- Create one default stock-settings row for each existing business.
insert into public.mc_saas_stock_settings(business_id)
select id from public.mc_saas_businesses
on conflict (business_id) do nothing;

-- Seed existing label1/label2 values without changing the source product rows.
-- label1 is the base unit. label2 conversion remains UNCONFIGURED until a human
-- enters the correct pack size; no assumption is made about box/packet contents.
do $$
begin
  if exists (
    select 1 from public.mc_saas_products
    where coalesce(trim(barcode),'') <> ''
    group by business_id,lower(trim(barcode)) having count(*) > 1
  ) then
    raise exception 'Duplicate existing product barcodes detected. Resolve them before applying the hybrid stock migration.';
  end if;
end $$;

insert into public.mc_saas_product_units
  (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
select p.business_id,p.id,coalesce(nullif(trim(p.label1),''),'Unit'),1,true,true,
       coalesce(nullif(trim(p.barcode),''),''),p.price1
from public.mc_saas_products p
on conflict do nothing;

insert into public.mc_saas_product_units
  (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
select p.business_id,p.id,trim(p.label2),1,false,false,'',p.price2
from public.mc_saas_products p
where coalesce(trim(p.label2),'') <> ''
  and lower(trim(p.label2)) <> lower(coalesce(nullif(trim(p.label1),''),'Unit'))
on conflict do nothing;

insert into public.mc_saas_product_stock(business_id,product_id)
select business_id,id from public.mc_saas_products
on conflict (business_id,product_id) do nothing;


-- Keep the legacy two unit/price fields aligned with the unit table for future
-- product creation/edits. Secondary conversion is reset to unverified if its
-- label changes, because a renamed package may have a different pack size.
create or replace function public.mc_saas_sync_product_units_from_product()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old_secondary text; v_updated integer;
begin
  if tg_op='INSERT' then
    insert into public.mc_saas_product_units
      (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
    values(new.business_id,new.id,coalesce(nullif(trim(new.label1),''),'Unit'),1,true,true,coalesce(nullif(trim(new.barcode),''),''),new.price1)
    on conflict do nothing;
    if coalesce(trim(new.label2),'')<>'' and lower(trim(new.label2))<>lower(coalesce(nullif(trim(new.label1),''),'Unit')) then
      insert into public.mc_saas_product_units
        (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
      values(new.business_id,new.id,trim(new.label2),1,false,false,'',new.price2)
      on conflict do nothing;
    end if;
    return new;
  end if;

  update public.mc_saas_product_units
  set unit_name=coalesce(nullif(trim(new.label1),''),'Unit'),selling_price=new.price1,
      barcode=coalesce(nullif(trim(new.barcode),''),''),updated_at=now()
  where business_id=new.business_id and product_id=new.id and is_base_unit=true;

  v_old_secondary := coalesce(nullif(trim(old.label2),''),'');
  if v_old_secondary<>'' and lower(v_old_secondary)<>lower(coalesce(nullif(trim(old.label1),''),'Unit')) then
    if coalesce(nullif(trim(new.label2),''),'')<>'' and lower(trim(new.label2))<>lower(coalesce(nullif(trim(new.label1),''),'Unit')) then
      update public.mc_saas_product_units
      set unit_name=trim(new.label2),selling_price=new.price2,
          conversion_configured=case when lower(v_old_secondary)<>lower(trim(new.label2)) then false else conversion_configured end,
          updated_at=now()
      where business_id=new.business_id and product_id=new.id and is_base_unit=false
        and lower(trim(unit_name))=lower(v_old_secondary);
      get diagnostics v_updated = row_count;
      if v_updated=0 then
        insert into public.mc_saas_product_units
          (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
        values(new.business_id,new.id,trim(new.label2),1,false,false,'',new.price2)
        on conflict do nothing;
      end if;
    end if;
  elsif coalesce(nullif(trim(new.label2),''),'')<>'' and lower(trim(new.label2))<>lower(coalesce(nullif(trim(new.label1),''),'Unit')) then
    insert into public.mc_saas_product_units
      (business_id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,barcode,selling_price)
    values(new.business_id,new.id,trim(new.label2),1,false,false,'',new.price2)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_product_units_sync_from_product on public.mc_saas_products;
create trigger mc_saas_product_units_sync_from_product
after insert or update on public.mc_saas_products
for each row execute function public.mc_saas_sync_product_units_from_product();

-- Keep stock settings available for businesses created after this migration.
create or replace function public.mc_saas_stock_settings_on_business_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.mc_saas_stock_settings(business_id) values(new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists mc_saas_stock_settings_business_insert on public.mc_saas_businesses;
create trigger mc_saas_stock_settings_business_insert
after insert on public.mc_saas_businesses
for each row execute function public.mc_saas_stock_settings_on_business_insert();

-- Verify that a unit belongs to the same business as its product.
create or replace function public.mc_saas_validate_product_unit_business()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.mc_saas_products p where p.id=new.product_id and p.business_id=new.business_id) then
    raise exception 'Product unit business_id must match the product business.';
  end if;
  if new.is_base_unit and (new.conversion_to_base <> 1 or not new.conversion_configured) then
    raise exception 'The base unit must have conversion factor 1 and be configured.';
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_product_unit_business_check on public.mc_saas_product_units;
create trigger mc_saas_product_unit_business_check
before insert or update on public.mc_saas_product_units
for each row execute function public.mc_saas_validate_product_unit_business();

-- Ensure product stock belongs to the same business as its product.
create or replace function public.mc_saas_validate_product_stock_business()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.mc_saas_products p where p.id=new.product_id and p.business_id=new.business_id) then
    raise exception 'Stock business_id must match the product business.';
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_product_stock_business_check on public.mc_saas_product_stock;
create trigger mc_saas_product_stock_business_check
before insert or update on public.mc_saas_product_stock
for each row execute function public.mc_saas_validate_product_stock_business();

-- A reservation is created as pending for every new order line. It becomes
-- reserved only after the business enables reservations, stock is initialized,
-- and the unit conversion is explicitly configured with enough available stock.
create or replace function public.mc_saas_process_order_reservations(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_order public.mc_saas_orders%rowtype;
  v_enabled boolean := false;
  v_item jsonb;
  v_line integer := 0;
  v_product_id uuid;
  v_unit_name text;
  v_qty numeric(18,6);
  v_unit public.mc_saas_product_units%rowtype;
  v_physical numeric(18,6);
  v_reserved numeric(18,6);
  v_status text;
  v_note text;
  v_reserved_count integer := 0;
  v_pending_count integer := 0;
  v_exception_count integer := 0;
begin
  select * into v_order from public.mc_saas_orders where id=p_order_id;
  if not found then raise exception 'Order not found.'; end if;
  select reservations_enabled into v_enabled from public.mc_saas_stock_settings where business_id=v_order.business_id;
  if v_order.order_status='cancelled' then
    update public.mc_saas_stock_reservations set status='released',note='Order cancelled',updated_at=now()
    where order_id=p_order_id and status in ('reserved','pending','exception');
    return jsonb_build_object('order_id',p_order_id,'released',true);
  end if;
  if v_order.order_status='delivered' then
    return jsonb_build_object('order_id',p_order_id,'message','Delivered order remains reserved until POS reconciliation.');
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_order.items,'[]'::jsonb)) loop
    v_unit := null;
    v_line := v_line + 1;
    v_status := 'pending'; v_note := 'Waiting for stock setup or reservation activation.';
    begin v_product_id := nullif(v_item->>'product_id','')::uuid; exception when others then v_product_id := null; end;
    begin v_qty := nullif(v_item->>'quantity','')::numeric; exception when others then v_qty := null; end;
    v_unit_name := coalesce(nullif(trim(v_item->>'unit'),''),'');
    if v_product_id is null or v_qty is null or v_qty <= 0 then
      v_status := 'exception'; v_note := 'Order line is missing a valid product_id or positive quantity.';
    elsif not exists(select 1 from public.mc_saas_products p where p.id=v_product_id and p.business_id=v_order.business_id) then
      v_product_id := null; v_status := 'exception'; v_note := 'Product does not belong to this business.';
    else
      select * into v_unit from public.mc_saas_product_units u
      where u.business_id=v_order.business_id and u.product_id=v_product_id
        and lower(trim(u.unit_name))=lower(trim(v_unit_name)) and u.is_active
      limit 1;
      if not found then
        v_status := 'exception'; v_note := 'Order unit does not match a configured product unit.';
      elsif not v_unit.conversion_configured then
        v_status := 'pending'; v_note := 'Unit conversion must be configured before reserving stock.';
      elsif not coalesce(v_enabled,false) then
        v_status := 'pending'; v_note := 'Automatic reservations are disabled for this business.';
      else
        select physical_qty_base into v_physical from public.mc_saas_product_stock
        where business_id=v_order.business_id and product_id=v_product_id and stock_initialized=true
        for update;
        if not found then
          v_status := 'pending'; v_note := 'Waiting for initial POS stock import.';
        else
          select coalesce(sum(quantity_base),0) into v_reserved
          from public.mc_saas_stock_reservations
          where business_id=v_order.business_id and product_id=v_product_id and status in ('reserved','exception')
            and not (order_id=p_order_id and order_line_no=v_line);
          if (v_physical-v_reserved) >= (v_qty*v_unit.conversion_to_base) then
            v_status := 'reserved'; v_note := 'Stock reserved.';
          else
            v_status := 'exception'; v_note := 'Insufficient available stock; manual review required.';
          end if;
        end if;
      end if;
    end if;
    insert into public.mc_saas_stock_reservations
      (business_id,order_id,order_line_no,product_id,product_unit_id,unit_name,quantity,conversion_to_base,quantity_base,status,note)
    values
      (v_order.business_id,p_order_id,v_line,v_product_id,case when v_unit.id is not null then v_unit.id else null end,
       v_unit_name,v_qty,case when v_unit.id is not null then v_unit.conversion_to_base else null end,
       case when v_unit.id is not null and v_qty is not null then v_qty*v_unit.conversion_to_base else null end,v_status,v_note)
    on conflict (order_id,order_line_no) do update set
      product_id=excluded.product_id,product_unit_id=excluded.product_unit_id,unit_name=excluded.unit_name,
      quantity=excluded.quantity,conversion_to_base=excluded.conversion_to_base,quantity_base=excluded.quantity_base,
      status=case when public.mc_saas_stock_reservations.status='reserved' then 'reserved' else excluded.status end,
      note=case when public.mc_saas_stock_reservations.status='reserved' then public.mc_saas_stock_reservations.note else excluded.note end,
      updated_at=now();
    if v_status='reserved' then v_reserved_count:=v_reserved_count+1;
    elsif v_status='pending' then v_pending_count:=v_pending_count+1;
    else v_exception_count:=v_exception_count+1; end if;
    v_unit := null;
  end loop;
  return jsonb_build_object('order_id',p_order_id,'reserved_lines',v_reserved_count,'pending_lines',v_pending_count,'exception_lines',v_exception_count);
end $$;

create or replace function public.mc_saas_order_reservation_after_insert()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  perform public.mc_saas_process_order_reservations(new.id);
  return new;
end $$;
drop trigger if exists mc_saas_order_reservation_insert on public.mc_saas_orders;
create trigger mc_saas_order_reservation_insert
after insert on public.mc_saas_orders
for each row execute function public.mc_saas_order_reservation_after_insert();

create or replace function public.mc_saas_order_reservation_status_change()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if new.order_status='cancelled' and old.order_status is distinct from new.order_status then
    update public.mc_saas_stock_reservations set status='released',note='Order cancelled',updated_at=now()
    where order_id=new.id and status in ('reserved','pending','exception');
  elsif old.order_status='cancelled' and new.order_status in ('new','confirmed','preparing','out_for_delivery') then
    perform public.mc_saas_process_order_reservations(new.id);
  end if;
  return new;
end $$;
drop trigger if exists mc_saas_order_reservation_status on public.mc_saas_orders;
create trigger mc_saas_order_reservation_status
after update of order_status on public.mc_saas_orders
for each row execute function public.mc_saas_order_reservation_status_change();


create or replace function public.mc_saas_order_items_reservation_refresh()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if new.order_status='delivered' then
    raise exception 'Delivered order items cannot be changed after delivery.';
  end if;
  update public.mc_saas_stock_reservations set status='released',note='Order items changed; recalculating reservation.',updated_at=now()
  where order_id=new.id and status in ('reserved','pending','exception');
  perform public.mc_saas_process_order_reservations(new.id);
  return new;
end $$;
drop trigger if exists mc_saas_order_items_reservation_refresh on public.mc_saas_orders;
create trigger mc_saas_order_items_reservation_refresh
after update of items on public.mc_saas_orders
for each row when (old.items is distinct from new.items)
execute function public.mc_saas_order_items_reservation_refresh();

-- Staff can retry reservation after stock and unit configuration are complete.
create or replace function public.mc_saas_reserve_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_business_id uuid; v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select business_id into v_business_id from public.mc_saas_orders where id=p_order_id;
  if not found or not public.mc_saas_can_manage(v_business_id) then raise exception 'Order not found or access denied.'; end if;
  select reservations_enabled into v_enabled from public.mc_saas_stock_settings where business_id=v_business_id;
  if not coalesce(v_enabled,false) then raise exception 'Enable reservations only after unit conversions and POS stock are configured.'; end if;
  return public.mc_saas_process_order_reservations(p_order_id);
end $$;

-- Set the first opening balance once. Subsequent physical stock updates should
-- come from the POS snapshot function, not from editing the stock table.
create or replace function public.mc_saas_set_opening_stock(
  p_business_id uuid,p_product_id uuid,p_quantity_base numeric,p_note text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_existing boolean;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_quantity_base is null or p_quantity_base < 0 then raise exception 'Opening stock must be zero or greater.'; end if;
  if not exists(select 1 from public.mc_saas_products where id=p_product_id and business_id=p_business_id) then raise exception 'Product not found in this business.'; end if;
  insert into public.mc_saas_product_stock(business_id,product_id) values(p_business_id,p_product_id) on conflict do nothing;
  select stock_initialized into v_existing from public.mc_saas_product_stock where business_id=p_business_id and product_id=p_product_id for update;
  if v_existing then raise exception 'Opening stock has already been set. Use a POS stock snapshot for subsequent updates.'; end if;
  update public.mc_saas_product_stock set physical_qty_base=p_quantity_base,stock_initialized=true,updated_at=now()
  where business_id=p_business_id and product_id=p_product_id;
  insert into public.mc_saas_stock_movements(business_id,product_id,movement_type,quantity_base,reference_type,note,created_by)
  values(p_business_id,p_product_id,'opening_balance',p_quantity_base,'manual_opening',coalesce(nullif(trim(p_note),''),'Initial stock balance'),auth.uid());
  return jsonb_build_object('business_id',p_business_id,'product_id',p_product_id,'physical_qty_base',p_quantity_base,'initialized',true);
end $$;

-- Apply an idempotent POS stock snapshot. The supplied quantity is in the
-- selected POS/catalogue unit and is converted to the product base unit.
create or replace function public.mc_saas_apply_pos_stock_snapshot(
  p_business_id uuid,p_product_unit_id uuid,p_quantity numeric,p_source_type text,p_external_event_id text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_unit public.mc_saas_product_units%rowtype;
  v_old numeric(18,6);
  v_new numeric(18,6);
  v_event_id uuid;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_source_type not in ('file','api','local_connector','manual') then raise exception 'Unsupported source type.'; end if;
  if coalesce(trim(p_external_event_id),'')='' then raise exception 'A unique external event ID is required.'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'POS stock quantity must be zero or greater.'; end if;
  select * into v_unit from public.mc_saas_product_units where id=p_product_unit_id and business_id=p_business_id and is_active for update;
  if not found then raise exception 'Product unit not found.'; end if;
  if not v_unit.conversion_configured then raise exception 'Configure this unit conversion before importing stock.'; end if;
  insert into public.mc_saas_stock_sync_events(business_id,source_type,external_event_id,event_type,payload)
  values(p_business_id,p_source_type,p_external_event_id,'stock_snapshot',jsonb_build_object('unit_id',p_product_unit_id,'quantity',p_quantity))
  on conflict (business_id,source_type,external_event_id,event_type) do nothing returning id into v_event_id;
  if v_event_id is null then return jsonb_build_object('duplicate',true,'message','This POS event was already processed.'); end if;
  insert into public.mc_saas_product_stock(business_id,product_id) values(p_business_id,v_unit.product_id) on conflict do nothing;
  select physical_qty_base into v_old from public.mc_saas_product_stock where business_id=p_business_id and product_id=v_unit.product_id for update;
  v_new := p_quantity*v_unit.conversion_to_base;
  update public.mc_saas_product_stock set physical_qty_base=v_new,stock_initialized=true,last_pos_sync_at=now(),updated_at=now()
  where business_id=p_business_id and product_id=v_unit.product_id;
  insert into public.mc_saas_stock_movements(business_id,product_id,product_unit_id,movement_type,quantity_base,reference_type,reference_id,external_event_id,note,created_by)
  values(p_business_id,v_unit.product_id,v_unit.id,'pos_snapshot',v_new-coalesce(v_old,0),'pos_event',v_event_id::text,p_external_event_id,'POS stock snapshot delta',auth.uid());
  update public.mc_saas_stock_sync_events set status='processed',result=jsonb_build_object('physical_qty_base',v_new,'delta_base',v_new-coalesce(v_old,0)),processed_at=now() where id=v_event_id;
  return jsonb_build_object('duplicate',false,'product_id',v_unit.product_id,'physical_qty_base',v_new,'delta_base',v_new-coalesce(v_old,0));
end $$;

-- Reconcile a reservation only after the POS confirms that the sale is already
-- represented in its physical stock. This releases the reservation; it does
-- NOT subtract physical stock a second time.
create or replace function public.mc_saas_reconcile_order_sale(
  p_business_id uuid,p_order_id uuid,p_source_type text,p_external_event_id text
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_event_id uuid; v_count integer;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_source_type not in ('file','api','local_connector','manual') then raise exception 'Unsupported source type.'; end if;
  if coalesce(trim(p_external_event_id),'')='' then raise exception 'A unique POS sale event ID is required.'; end if;
  if not exists(select 1 from public.mc_saas_orders where id=p_order_id and business_id=p_business_id and order_status='delivered') then raise exception 'Only a delivered order can be reconciled as a completed POS sale.'; end if;
  insert into public.mc_saas_stock_sync_events(business_id,source_type,external_event_id,event_type,payload)
  values(p_business_id,p_source_type,p_external_event_id,'order_sale_reconciliation',jsonb_build_object('order_id',p_order_id))
  on conflict (business_id,source_type,external_event_id,event_type) do nothing returning id into v_event_id;
  if v_event_id is null then return jsonb_build_object('duplicate',true,'message','This POS sale event was already processed.'); end if;
  update public.mc_saas_stock_reservations set status='reconciled',note='POS confirmed sale; physical stock is managed by POS snapshot.',updated_at=now()
  where business_id=p_business_id and order_id=p_order_id and status in ('reserved','exception');
  get diagnostics v_count = row_count;
  update public.mc_saas_stock_sync_events set status='processed',result=jsonb_build_object('order_id',p_order_id,'reservation_lines_reconciled',v_count),processed_at=now() where id=v_event_id;
  return jsonb_build_object('duplicate',false,'order_id',p_order_id,'reservation_lines_reconciled',v_count);
end $$;

-- A compact staff-only view of physical, reserved and available base quantities.
create or replace view public.mc_saas_stock_availability as
select s.business_id,s.product_id,s.physical_qty_base,s.stock_initialized,s.last_pos_sync_at,
       coalesce(r.reserved_qty_base,0) as reserved_qty_base,
       case when s.stock_initialized then greatest(s.physical_qty_base-coalesce(r.reserved_qty_base,0),0) else null end as available_qty_base,
       case when not s.stock_initialized then 'unknown'
            when s.physical_qty_base-coalesce(r.reserved_qty_base,0) > 0 then 'in_stock'
            else 'out_of_stock' end as availability_status
from public.mc_saas_product_stock s
left join (
  select business_id,product_id,sum(quantity_base) as reserved_qty_base
  from public.mc_saas_stock_reservations where status in ('reserved','exception')
  group by business_id,product_id
) r on r.business_id=s.business_id and r.product_id=s.product_id;

-- RLS: all stock data is private to the business management roles.
-- Immutable ledgers/reservations are read-only from the browser; trusted
-- SECURITY DEFINER triggers/RPCs write them. This prevents client-side edits
-- to physical stock, reservation balances or audit history.
ALTER TABLE public.mc_saas_stock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_pos_unit_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_saas_stock_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_saas_stock_settings_manage ON public.mc_saas_stock_settings;
CREATE POLICY mc_saas_stock_settings_manage ON public.mc_saas_stock_settings
  FOR ALL TO authenticated USING (public.mc_saas_can_manage(business_id))
  WITH CHECK (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_product_units_manage ON public.mc_saas_product_units;
CREATE POLICY mc_saas_product_units_manage ON public.mc_saas_product_units
  FOR ALL TO authenticated USING (public.mc_saas_can_manage(business_id))
  WITH CHECK (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_product_stock_read ON public.mc_saas_product_stock;
CREATE POLICY mc_saas_product_stock_read ON public.mc_saas_product_stock
  FOR SELECT TO authenticated USING (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_stock_reservations_read ON public.mc_saas_stock_reservations;
CREATE POLICY mc_saas_stock_reservations_read ON public.mc_saas_stock_reservations
  FOR SELECT TO authenticated USING (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_stock_movements_read ON public.mc_saas_stock_movements;
CREATE POLICY mc_saas_stock_movements_read ON public.mc_saas_stock_movements
  FOR SELECT TO authenticated USING (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_pos_unit_mappings_manage ON public.mc_saas_pos_unit_mappings;
CREATE POLICY mc_saas_pos_unit_mappings_manage ON public.mc_saas_pos_unit_mappings
  FOR ALL TO authenticated USING (public.mc_saas_can_manage(business_id))
  WITH CHECK (public.mc_saas_can_manage(business_id));
DROP POLICY IF EXISTS mc_saas_stock_sync_events_read ON public.mc_saas_stock_sync_events;
CREATE POLICY mc_saas_stock_sync_events_read ON public.mc_saas_stock_sync_events
  FOR SELECT TO authenticated USING (public.mc_saas_can_manage(business_id));

REVOKE ALL ON public.mc_saas_stock_settings FROM anon;
REVOKE ALL ON public.mc_saas_product_units FROM anon;
REVOKE ALL ON public.mc_saas_product_stock FROM anon;
REVOKE ALL ON public.mc_saas_stock_reservations FROM anon;
REVOKE ALL ON public.mc_saas_stock_movements FROM anon;
REVOKE ALL ON public.mc_saas_pos_unit_mappings FROM anon;
REVOKE ALL ON public.mc_saas_stock_sync_events FROM anon;
GRANT SELECT,UPDATE ON public.mc_saas_stock_settings TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.mc_saas_product_units TO authenticated;
GRANT SELECT ON public.mc_saas_product_stock TO authenticated;
GRANT SELECT ON public.mc_saas_stock_reservations TO authenticated;
GRANT SELECT ON public.mc_saas_stock_movements TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.mc_saas_pos_unit_mappings TO authenticated;
GRANT SELECT ON public.mc_saas_stock_sync_events TO authenticated;

ALTER VIEW public.mc_saas_stock_availability SET (security_invoker = true);
REVOKE ALL ON public.mc_saas_stock_availability FROM anon;
GRANT SELECT ON public.mc_saas_stock_availability TO authenticated;

-- RPC permissions: no anonymous execution and no browser/service-role secret required.
REVOKE ALL ON FUNCTION public.mc_saas_process_order_reservations(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_order_reservation_after_insert() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_order_reservation_status_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_order_items_reservation_refresh() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_stock_settings_on_business_insert() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_sync_product_units_from_product() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_validate_product_unit_business() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_validate_product_stock_business() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_validate_pos_unit_mapping() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_reserve_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_saas_reserve_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_set_opening_stock(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_saas_set_opening_stock(uuid,uuid,numeric,text) TO authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_apply_pos_stock_snapshot(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_saas_apply_pos_stock_snapshot(uuid,uuid,numeric,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.mc_saas_reconcile_order_sale(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mc_saas_reconcile_order_sale(uuid,uuid,text,text) TO authenticated;

commit;

-- After running, verify counts:
-- SELECT count(*) FROM public.mc_saas_product_units;
-- SELECT count(*) FROM public.mc_saas_product_stock;
-- SELECT * FROM public.mc_saas_stock_settings;
-- SELECT * FROM public.mc_saas_stock_availability LIMIT 10;
-- Reservations remain disabled until each business configures conversions and stock.
