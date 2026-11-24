-- My Catalogue v29 — full POS for shops without their own POS
--  * main_system: 'catalogue' (My Catalogue POS is the main system) or 'external' (their own POS, e.g. AntiSoft, is the main system)
--  * suppliers, purchase invoices (stock in + cost), supplier payments
--  * stock adjustments (damage / loss / found), reorder level per product
--  * correct cost for packets / boxes in POS sales (cost_price = cost of the FIRST unit)

-- 1. main system -------------------------------------------------------------
alter table public.mc_saas_businesses add column if not exists main_system text not null default 'catalogue';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mc_saas_businesses_main_system_check') then
    alter table public.mc_saas_businesses add constraint mc_saas_businesses_main_system_check check (main_system in ('catalogue','external'));
  end if;
end $$;

create or replace function public.mc_saas_set_main_system(p_business_id uuid, p_main text)
returns text language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_main not in ('catalogue','external') then raise exception 'Unknown main system.'; end if;
  update public.mc_saas_businesses set main_system = p_main where id = p_business_id;
  return p_main;
end $$;
revoke all on function public.mc_saas_set_main_system(uuid, text) from public, anon;
grant execute on function public.mc_saas_set_main_system(uuid, text) to authenticated;

-- 2. reorder level -----------------------------------------------------------
alter table public.mc_saas_products add column if not exists reorder_level numeric(14,3);

-- 3. suppliers & purchases ---------------------------------------------------
create table if not exists public.mc_saas_suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text, note text,
  balance numeric(14,2) not null default 0,          -- what the shop still owes this supplier (USD)
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists mc_saas_suppliers_biz on public.mc_saas_suppliers(business_id, name);

create table if not exists public.mc_saas_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  client_uuid uuid not null,
  purchase_no bigint not null,
  supplier_id uuid references public.mc_saas_suppliers(id) on delete set null,
  supplier_name text,
  ref_no text,                                        -- the supplier's invoice number
  purchase_date date not null default current_date,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  note text, created_by uuid, cashier_name text,
  created_at timestamptz not null default now(),
  unique (business_id, client_uuid)
);
create index if not exists mc_saas_purchases_biz on public.mc_saas_purchases(business_id, purchase_date desc);

create table if not exists public.mc_saas_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  client_uuid uuid,
  supplier_id uuid references public.mc_saas_suppliers(id) on delete set null,
  purchase_id uuid references public.mc_saas_purchases(id) on delete set null,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  paid_usd numeric(14,2) not null default 0, paid_lbp numeric(16,0) not null default 0, rate numeric(14,2),
  method text not null default 'cash' check (method in ('cash','card','bank','cheque')),
  from_drawer boolean not null default false,
  note text, created_by uuid, cashier_name text,
  created_at timestamptz not null default now(),
  unique (business_id, client_uuid)
);
create index if not exists mc_saas_supplier_payments_biz on public.mc_saas_supplier_payments(business_id, created_at desc);

alter table public.mc_saas_suppliers enable row level security;
alter table public.mc_saas_purchases enable row level security;
alter table public.mc_saas_supplier_payments enable row level security;
drop policy if exists mc_saas_suppliers_read on public.mc_saas_suppliers;
create policy mc_saas_suppliers_read on public.mc_saas_suppliers for select using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_purchases_read on public.mc_saas_purchases;
create policy mc_saas_purchases_read on public.mc_saas_purchases for select using (public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_supplier_payments_read on public.mc_saas_supplier_payments;
create policy mc_saas_supplier_payments_read on public.mc_saas_supplier_payments for select using (public.mc_saas_can_manage(business_id));
-- writes only through the functions below
revoke insert, update, delete on public.mc_saas_suppliers, public.mc_saas_purchases, public.mc_saas_supplier_payments from anon, authenticated;
grant select on public.mc_saas_suppliers, public.mc_saas_purchases, public.mc_saas_supplier_payments to authenticated;

alter table public.mc_saas_pos_settings add column if not exists next_purchase_no bigint not null default 1;

-- helper: cost of one MAIN (base) unit from a product's cost_price (which is the cost of its FIRST unit)
create or replace function public.mc_saas_base_cost(p_business_id uuid, p_product_id uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.cost_price is null then null
              else p.cost_price / coalesce(nullif(public.mc_saas_pos_unit_factor(p_business_id, p.id, p.label1), 0), 1) end
    from public.mc_saas_products p where p.id = p_product_id and p.business_id = p_business_id
$$;
revoke all on function public.mc_saas_base_cost(uuid, uuid) from public, anon, authenticated;

create or replace function public.mc_saas_save_supplier(p_business_id uuid, p_id uuid, p_name text, p_phone text, p_note text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id uuid;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  if nullif(trim(p_name),'') is null then raise exception 'Supplier name is required.'; end if;
  if p_id is null then
    insert into public.mc_saas_suppliers(business_id, name, phone, note) values (p_business_id, left(trim(p_name),120), left(trim(p_phone),40), left(p_note,500)) returning id into v_id;
  else
    update public.mc_saas_suppliers set name = left(trim(p_name),120), phone = left(trim(p_phone),40), note = left(p_note,500), is_active = coalesce(p_active, true), updated_at = now()
     where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'Supplier not found.'; end if;
  end if;
  return v_id;
end $$;

-- a purchase invoice: stock comes in, cost prices update, supplier balance grows by what is not paid
create or replace function public.mc_saas_record_purchase(p_business_id uuid, p_purchase jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_uuid uuid; v_ex public.mc_saas_purchases; it jsonb; v_items jsonb := '[]'::jsonb; v_sub numeric := 0; v_disc numeric; v_total numeric; v_paid numeric;
  v_pid uuid; v_pname text; v_label1 text; v_qty numeric; v_cost numeric; v_f numeric; v_f1 numeric; v_base numeric; v_line numeric;
  v_sup public.mc_saas_suppliers; v_no bigint; v_id uuid; v_update_cost boolean; v_cname text; v_cashier uuid; v_rate numeric; v_pu numeric; v_pl numeric;
  v_method text; v_drawer boolean;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := (p_purchase->>'client_uuid')::uuid;
  if v_uuid is null then raise exception 'Missing purchase id.'; end if;
  select * into v_ex from public.mc_saas_purchases where business_id = p_business_id and client_uuid = v_uuid;
  if found then return jsonb_build_object('id', v_ex.id, 'purchase_no', v_ex.purchase_no, 'duplicate', true); end if;
  if jsonb_typeof(p_purchase->'items') <> 'array' or jsonb_array_length(p_purchase->'items') not between 1 and 500 then raise exception 'Add between 1 and 500 items.'; end if;
  v_update_cost := coalesce((p_purchase->>'update_cost')::boolean, true);
  v_cashier := nullif(p_purchase->>'cashier_id','')::uuid; v_cname := public.mc_saas_pos_cashier_name(p_business_id, v_cashier);
  if nullif(p_purchase->>'supplier_id','') is not null then
    select * into v_sup from public.mc_saas_suppliers where id = (p_purchase->>'supplier_id')::uuid and business_id = p_business_id for update;
    if v_sup.id is null then raise exception 'Supplier not found.'; end if;
  end if;
  insert into public.mc_saas_pos_settings(business_id) values (p_business_id) on conflict do nothing;
  update public.mc_saas_pos_settings set next_purchase_no = next_purchase_no + 1 where business_id = p_business_id returning next_purchase_no - 1 into v_no;
  v_id := gen_random_uuid();
  for it in select value from jsonb_array_elements(p_purchase->'items') loop
    v_qty := coalesce((it->>'qty')::numeric, 0); v_cost := coalesce((it->>'unit_cost')::numeric, -1);
    if v_qty <= 0 or v_qty > 10000000 then raise exception 'Invalid quantity.'; end if;
    if v_cost < 0 then raise exception 'Missing cost for an item.'; end if;
    select id, name, label1 into v_pid, v_pname, v_label1 from public.mc_saas_products where id = nullif(it->>'product_id','')::uuid and business_id = p_business_id;
    if v_pid is null then raise exception 'A product in this purchase does not exist.'; end if;
    v_f := public.mc_saas_pos_unit_factor(p_business_id, v_pid, it->>'unit');
    if v_f is null then raise exception 'Set how many pieces are in 1 % of % first (Items & stock).', it->>'unit', v_pname; end if;
    v_base := v_qty * v_f; v_line := round(v_qty * v_cost, 2); v_sub := v_sub + v_line;
    -- stock in
    insert into public.mc_saas_product_stock(business_id, product_id) values (p_business_id, v_pid) on conflict do nothing;
    update public.mc_saas_product_stock
       set physical_qty_base = case when stock_initialized then physical_qty_base else 0 end + v_base, stock_initialized = true, updated_at = now()
     where business_id = p_business_id and product_id = v_pid;
    insert into public.mc_saas_stock_movements(business_id, product_id, movement_type, quantity_base, reference_type, reference_id, note, created_by)
    values (p_business_id, v_pid, 'purchase', v_base, 'purchase', v_id::text, 'Purchase P-' || lpad(v_no::text, 5, '0') || coalesce(' · ' || v_sup.name, ''), auth.uid());
    -- cost of the product's FIRST unit, from this purchase
    if v_update_cost then
      v_f1 := coalesce(nullif(public.mc_saas_pos_unit_factor(p_business_id, v_pid, v_label1), 0), 1);
      update public.mc_saas_products set cost_price = round(v_cost / v_f * v_f1, 4), updated_at = now() where id = v_pid and business_id = p_business_id;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_pid, 'name', v_pname, 'unit', left(coalesce(it->>'unit',''),40), 'qty', v_qty,
      'unit_cost', v_cost, 'line_total', v_line, 'qty_base', v_base));
  end loop;
  v_disc := least(greatest(coalesce((p_purchase->>'discount')::numeric, 0), 0), v_sub);
  v_total := round(v_sub - v_disc, 2);
  v_rate := coalesce(nullif((p_purchase->>'rate')::numeric, 0), (select lbp_rate from public.mc_saas_pos_settings where business_id = p_business_id), 89500);
  v_pu := greatest(coalesce((p_purchase->>'paid_usd')::numeric, 0), 0); v_pl := greatest(coalesce((p_purchase->>'paid_lbp')::numeric, 0), 0);
  v_paid := least(round(v_pu + v_pl / v_rate, 2), v_total);
  if v_paid + 0.01 < v_total and v_sup.id is null then raise exception 'Choose a supplier to buy on credit (what is not paid now is owed to the supplier).'; end if;
  insert into public.mc_saas_purchases(id, business_id, client_uuid, purchase_no, supplier_id, supplier_name, ref_no, purchase_date, items, subtotal, discount, total, paid, note, created_by, cashier_name)
  values (v_id, p_business_id, v_uuid, v_no, v_sup.id, coalesce(v_sup.name, nullif(trim(p_purchase->>'supplier_name'),''), 'Supplier'), left(p_purchase->>'ref_no', 60),
          coalesce(nullif(p_purchase->>'purchase_date','')::date, current_date), v_items, v_sub, v_disc, v_total, v_paid, left(p_purchase->>'note', 500), auth.uid(), v_cname);
  if v_sup.id is not null then
    update public.mc_saas_suppliers set balance = balance + v_total - v_paid, updated_at = now() where id = v_sup.id;
  end if;
  if v_paid > 0 then
    v_method := coalesce(nullif(p_purchase->>'method',''), 'cash'); v_drawer := coalesce((p_purchase->>'from_drawer')::boolean, v_method = 'cash');
    insert into public.mc_saas_supplier_payments(business_id, supplier_id, purchase_id, amount_usd, paid_usd, paid_lbp, rate, method, from_drawer, note, created_by, cashier_name)
    values (p_business_id, v_sup.id, v_id, v_paid, v_pu, v_pl, v_rate, v_method, v_drawer, 'Paid with purchase P-' || lpad(v_no::text, 5, '0'), auth.uid(), v_cname);
    if v_drawer then
      insert into public.mc_saas_pos_cash_entries(business_id, client_uuid, kind, category, amount_usd, paid_usd, paid_lbp, rate, from_drawer, entry_date, shift_id, cashier_id, cashier_name, note)
      values (p_business_id, gen_random_uuid(), 'cash_out', 'Supplier payment', v_paid, v_pu, v_pl, v_rate, true, current_date,
              nullif(p_purchase->>'shift_id','')::uuid, v_cashier, v_cname, 'Purchase P-' || lpad(v_no::text, 5, '0') || coalesce(' · ' || v_sup.name, ''));
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'purchase_no', v_no, 'total', v_total, 'paid', v_paid, 'owed', v_total - v_paid, 'duplicate', false);
end $$;

-- pay a supplier (what you owe goes down)
create or replace function public.mc_saas_supplier_payment(p_business_id uuid, p_pay jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_sup public.mc_saas_suppliers; v_rate numeric; v_pu numeric; v_pl numeric; v_amt numeric; v_method text; v_drawer boolean; v_cname text; v_cashier uuid; v_uuid uuid;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := nullif(p_pay->>'client_uuid','')::uuid;
  if v_uuid is not null and exists (select 1 from public.mc_saas_supplier_payments where business_id = p_business_id and client_uuid = v_uuid) then
    return jsonb_build_object('duplicate', true); end if;
  select * into v_sup from public.mc_saas_suppliers where id = (p_pay->>'supplier_id')::uuid and business_id = p_business_id for update;
  if v_sup.id is null then raise exception 'Supplier not found.'; end if;
  v_rate := coalesce(nullif((p_pay->>'rate')::numeric, 0), (select lbp_rate from public.mc_saas_pos_settings where business_id = p_business_id), 89500);
  v_pu := greatest(coalesce((p_pay->>'paid_usd')::numeric, 0), 0); v_pl := greatest(coalesce((p_pay->>'paid_lbp')::numeric, 0), 0);
  v_amt := round(v_pu + v_pl / v_rate, 2);
  if v_amt <= 0 then raise exception 'Enter the amount paid.'; end if;
  v_method := coalesce(nullif(p_pay->>'method',''), 'cash'); v_drawer := coalesce((p_pay->>'from_drawer')::boolean, v_method = 'cash');
  v_cashier := nullif(p_pay->>'cashier_id','')::uuid; v_cname := public.mc_saas_pos_cashier_name(p_business_id, v_cashier);
  insert into public.mc_saas_supplier_payments(business_id, client_uuid, supplier_id, amount_usd, paid_usd, paid_lbp, rate, method, from_drawer, note, created_by, cashier_name)
  values (p_business_id, v_uuid, v_sup.id, v_amt, v_pu, v_pl, v_rate, v_method, v_drawer, left(p_pay->>'note', 500), auth.uid(), v_cname);
  update public.mc_saas_suppliers set balance = balance - v_amt, updated_at = now() where id = v_sup.id;
  if v_drawer then
    insert into public.mc_saas_pos_cash_entries(business_id, client_uuid, kind, category, amount_usd, paid_usd, paid_lbp, rate, from_drawer, entry_date, shift_id, cashier_id, cashier_name, note)
    values (p_business_id, gen_random_uuid(), 'cash_out', 'Supplier payment', v_amt, v_pu, v_pl, v_rate, true, current_date, nullif(p_pay->>'shift_id','')::uuid, v_cashier, v_cname, 'Payment to ' || v_sup.name);
  end if;
  return jsonb_build_object('amount', v_amt, 'balance', v_sup.balance - v_amt, 'duplicate', false);
end $$;

-- stock adjustment: damaged, lost, found, expired… (quantity in main units, + or -)
create or replace function public.mc_saas_adjust_stock(p_business_id uuid, p_product_id uuid, p_delta_base numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_new numeric;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_delta_base is null or p_delta_base = 0 or abs(p_delta_base) > 100000000 then raise exception 'Enter a quantity to add or remove.'; end if;
  if not exists (select 1 from public.mc_saas_products where id = p_product_id and business_id = p_business_id) then raise exception 'Product not found.'; end if;
  insert into public.mc_saas_product_stock(business_id, product_id) values (p_business_id, p_product_id) on conflict do nothing;
  update public.mc_saas_product_stock
     set physical_qty_base = greatest(0, case when stock_initialized then physical_qty_base else 0 end + p_delta_base), stock_initialized = true, updated_at = now()
   where business_id = p_business_id and product_id = p_product_id returning physical_qty_base into v_new;
  insert into public.mc_saas_stock_movements(business_id, product_id, movement_type, quantity_base, reference_type, note, created_by)
  values (p_business_id, p_product_id, 'adjustment', p_delta_base, 'manual_adjustment', coalesce(nullif(trim(left(p_reason, 300)),''), 'Stock adjustment'), auth.uid());
  return v_new;
end $$;

revoke all on function public.mc_saas_save_supplier(uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function public.mc_saas_record_purchase(uuid, jsonb) from public, anon;
revoke all on function public.mc_saas_supplier_payment(uuid, jsonb) from public, anon;
revoke all on function public.mc_saas_adjust_stock(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.mc_saas_save_supplier(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.mc_saas_record_purchase(uuid, jsonb) to authenticated;
grant execute on function public.mc_saas_supplier_payment(uuid, jsonb) to authenticated;
grant execute on function public.mc_saas_adjust_stock(uuid, uuid, numeric, text) to authenticated;

-- 4. POS sales: cost of a packet / box = cost of the first unit / its size x the sold unit's size
do $$
declare d text; o text; n text;
begin
  d := pg_get_functiondef('public.mc_saas_pos_record_sale(uuid, jsonb)'::regprocedure);
  o := $o$      if v_pcp is not null then
        if coalesce(it->>'unit_index','1') = '1' then v_pcost := v_pcp;
        else v_f := public.mc_saas_pos_unit_factor(p_business_id, v_pid, it->>'unit');
             v_pcost := case when v_f is not null then v_pcp * v_f end; end if;
      end if;$o$;
  n := $n$      if v_pcp is not null then
        -- cost_price is the cost of the FIRST unit; other units cost (cost_price / first unit size) x their size
        if coalesce(it->>'unit_index','1') = '1' then v_pcost := v_pcp;
        else v_f := public.mc_saas_pos_unit_factor(p_business_id, v_pid, it->>'unit');
             v_pcost := case when v_f is not null then public.mc_saas_base_cost(p_business_id, v_pid) * v_f end; end if;
      end if;$n$;
  if position(o in d) > 0 then execute replace(d, o, n);
  elsif position('mc_saas_base_cost' in d) = 0 then raise exception 'record_sale changed: cost patch not applied'; end if;
end $$;
