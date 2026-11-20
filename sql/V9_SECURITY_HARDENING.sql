-- My Catalogue v9 — security & performance hardening (Phase A)
-- Safe with the current live website. Additive / tightening only. Run once.
-- Phase B (private business columns) is in V9_PHASE_B_PRIVATE_BUSINESS_COLUMNS.sql
-- and must run only AFTER the v9 website files are live.

-- 1) Orders: the server — not the shopper's browser — decides prices, totals and status.
create or replace function public.mc_saas_orders_before_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_biz record; v_p record; it jsonb; v_id text; v_qty numeric; v_unit int; v_price numeric; v_label text;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_recent int;
begin
  -- Staff and server-side inserts keep their own values.
  if coalesce(auth.role(), '') = 'service_role' or public.mc_saas_can_manage(new.business_id) then return new; end if;

  select id, currency, is_published into v_biz from public.mc_saas_businesses where id = new.business_id;
  if not found or not v_biz.is_published then raise exception 'This catalogue is not accepting orders.'; end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) not between 1 and 200 then
    raise exception 'An order must contain between 1 and 200 items.';
  end if;

  -- Anti-spam limits
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
    select id, name, label1, price1, label2, price2, is_active into v_p
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
    v_price := case when v_unit = 1 then v_p.price1 else v_p.price2 end;
    if v_price is null then raise exception '% has no price yet.', v_p.name; end if;
    v_label := case when v_unit = 1 then coalesce(nullif(v_p.label1, ''), 'Packet') else coalesce(nullif(v_p.label2, ''), 'Box') end;
    v_items := v_items || jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'unit', v_label, 'unit_index', v_unit,
      'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2));
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
end $$;
revoke all on function public.mc_saas_orders_before_insert() from public, anon, authenticated;
drop trigger if exists mc_saas_orders_before_insert_trg on public.mc_saas_orders;
create trigger mc_saas_orders_before_insert_trg before insert on public.mc_saas_orders
  for each row execute function public.mc_saas_orders_before_insert();

-- 2) Visitors (anon) may only READ the public catalogue and CREATE orders. Nothing else.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'mc_saas_%' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;
revoke select on public.mc_saas_orders from anon;
grant insert on public.mc_saas_orders to anon;

-- 3) Functions that visitors must never call
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'mc_saas_ai_consume_credits','mc_saas_ai_get_wallet','mc_saas_ai_grant_credits','mc_saas_ai_refund_credits',
             'mc_saas_ai_seed_new_business_wallet','mc_saas_pos_agent_create_key','mc_saas_pos_agent_revoke_key',
             'mc_saas_pos_agent_stock_snapshot','mc_saas_create_business','mc_saas_platform_list_businesses',
             'mc_saas_platform_set_published','mc_saas_platform_update_billing','mc_saas_set_opening_stock',
             'mc_saas_update_business_settings','mc_saas_update_catalogue_template','mc_saas_reserve_order',
             'mc_saas_reconcile_order_sale','mc_saas_apply_pos_stock_snapshot') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname in ('mc_saas_ai_refund_credits','mc_saas_pos_agent_stock_snapshot','mc_saas_ai_seed_new_business_wallet') then
      execute format('revoke execute on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- 4) Sync history is an audit log: members can read and add, never edit or delete.
drop policy if exists mc_saas_sync_changes_manage on public.mc_saas_sync_changes;
drop policy if exists mc_saas_sync_changes_read on public.mc_saas_sync_changes;
drop policy if exists mc_saas_sync_changes_insert on public.mc_saas_sync_changes;
create policy mc_saas_sync_changes_read on public.mc_saas_sync_changes for select to authenticated using (public.mc_saas_can_manage(business_id));
create policy mc_saas_sync_changes_insert on public.mc_saas_sync_changes for insert to authenticated with check (public.mc_saas_can_manage(business_id));
revoke update, delete on public.mc_saas_sync_changes from authenticated;

-- 5) Faster RLS: evaluate auth.uid() once per query instead of once per row
alter policy mc_saas_business_public_read on public.mc_saas_businesses using ((is_published = true) or (owner_id = (select auth.uid())) or public.mc_saas_is_member(id));
alter policy mc_saas_business_owner_update on public.mc_saas_businesses using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy mc_saas_member_read on public.mc_saas_members using ((user_id = (select auth.uid())) or public.mc_saas_can_manage(business_id));
alter policy mc_saas_orders_driver_read on public.mc_saas_orders using ((order_status = any (array['confirmed','preparing','out_for_delivery'])) and exists (select 1 from public.mc_saas_members m where m.business_id = mc_saas_orders.business_id and m.user_id = (select auth.uid()) and m.role = 'driver'));
alter policy mc_saas_quotes_insert on public.mc_saas_quotations with check (public.mc_saas_can_manage(business_id) and created_by = (select auth.uid()));
alter policy mc_saas_driver_insert on public.mc_saas_driver_locations with check (public.mc_saas_is_member(business_id) and driver_id = (select auth.uid()));
alter policy mc_saas_driver_update on public.mc_saas_driver_locations using (public.mc_saas_is_member(business_id) and driver_id = (select auth.uid())) with check (public.mc_saas_is_member(business_id) and driver_id = (select auth.uid()));
alter policy mc_ai_conversations_member_all on public.mc_saas_ai_conversations using (public.mc_saas_can_manage(business_id) and user_id = (select auth.uid())) with check (public.mc_saas_can_manage(business_id) and user_id = (select auth.uid()));

-- 6) Indexes for the lookups the app does most
create index if not exists mc_saas_members_user_idx on public.mc_saas_members(user_id);
create index if not exists mc_saas_product_units_product_idx on public.mc_saas_product_units(product_id);
create index if not exists mc_saas_product_stock_product_idx on public.mc_saas_product_stock(product_id);
create index if not exists mc_saas_sync_changes_job_idx on public.mc_saas_sync_changes(job_id);
create index if not exists mc_saas_sync_changes_product_idx on public.mc_saas_sync_changes(product_id);
create index if not exists mc_saas_stock_movements_product_idx on public.mc_saas_stock_movements(product_id);
create index if not exists mc_saas_stock_reservations_product_idx on public.mc_saas_stock_reservations(product_id);
create index if not exists mc_saas_driver_locations_business_idx on public.mc_saas_driver_locations(business_id);
create index if not exists mc_saas_orders_business_phone_created_idx on public.mc_saas_orders(business_id, customer_phone, created_at desc);
create index if not exists mc_saas_orders_business_created_idx on public.mc_saas_orders(business_id, created_at desc);

-- 7) Move the 13-Nov backup tables out of the public API (data kept, just not exposed)
create schema if not exists mc_backup;
revoke all on schema mc_backup from public, anon, authenticated;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'backup\_pm\_%' loop
    execute format('alter table public.%I set schema mc_backup', t);
  end loop;
end $$;
