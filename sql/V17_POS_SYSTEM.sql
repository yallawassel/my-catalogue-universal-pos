-- V17: My Catalogue POS — sells from the same products, prices, stock, customers and online orders.
-- All money is stored in USD; LBP amounts are stored as LBP with the exchange rate used.

-- 0) Plans: each business can have the Catalogue, the POS, or both.
alter table public.mc_saas_businesses add column if not exists pos_enabled boolean not null default false;
alter table public.mc_saas_businesses add column if not exists catalogue_enabled boolean not null default true;
grant select (pos_enabled, catalogue_enabled) on public.mc_saas_businesses to authenticated;
update public.mc_saas_businesses set pos_enabled = true where pos_enabled = false;  -- existing businesses start with POS on (trial)
alter table public.mc_saas_products add column if not exists cost_price numeric;
alter table public.mc_saas_products drop constraint if exists mc_saas_products_cost_check;
alter table public.mc_saas_products add constraint mc_saas_products_cost_check check (cost_price is null or cost_price >= 0);

-- 1) Settings
create table if not exists public.mc_saas_pos_settings (
  business_id uuid primary key references public.mc_saas_businesses(id) on delete cascade,
  lbp_rate numeric not null default 89500 check (lbp_rate > 0),
  round_lbp integer not null default 1000 check (round_lbp in (1,100,500,1000,5000,10000)),
  tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  receipt_header text, receipt_footer text default 'Thank you for your visit!',
  invoice_prefix text not null default 'INV' check (length(invoice_prefix) <= 10),
  next_invoice_no bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- 2) Cashiers (PIN, never stored in clear)
create table if not exists public.mc_saas_pos_cashiers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  pin_hash text not null,
  role text not null default 'cashier' check (role in ('cashier','manager')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists mc_saas_pos_cashiers_biz on public.mc_saas_pos_cashiers(business_id);

-- 3) Customers & debts (balance > 0 = the customer owes the business)
create table if not exists public.mc_saas_pos_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text, email text, address text, note text,
  credit_limit numeric check (credit_limit is null or credit_limit >= 0),
  balance numeric not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists mc_saas_pos_customers_biz on public.mc_saas_pos_customers(business_id, name);

-- 4) Shifts
create table if not exists public.mc_saas_pos_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  cashier_id uuid references public.mc_saas_pos_cashiers(id) on delete set null,
  cashier_name text not null default 'Owner',
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(), closed_at timestamptz,
  opening_usd numeric not null default 0, opening_lbp numeric not null default 0,
  counted_usd numeric, counted_lbp numeric, expected_usd numeric, expected_lbp numeric,
  totals jsonb, note text, opened_by uuid default auth.uid()
);
create index if not exists mc_saas_pos_shifts_biz on public.mc_saas_pos_shifts(business_id, opened_at desc);

-- 5) Sales and returns
create table if not exists public.mc_saas_pos_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  client_uuid uuid not null,
  kind text not null default 'sale' check (kind in ('sale','return')),
  invoice_no bigint not null, invoice_label text not null,
  ref_sale_id uuid references public.mc_saas_pos_sales(id) on delete set null,
  shift_id uuid references public.mc_saas_pos_shifts(id) on delete set null,
  cashier_id uuid references public.mc_saas_pos_cashiers(id) on delete set null, cashier_name text,
  customer_id uuid references public.mc_saas_pos_customers(id) on delete set null, customer_name text,
  order_id uuid references public.mc_saas_orders(id) on delete set null,
  items jsonb not null,
  subtotal numeric not null, discount numeric not null default 0, tax numeric not null default 0, total numeric not null,
  cost_total numeric,
  rate numeric not null,
  paid_usd numeric not null default 0, paid_lbp numeric not null default 0, paid_card numeric not null default 0,
  credit_amount numeric not null default 0, change_usd numeric not null default 0, change_lbp numeric not null default 0,
  payment_method text not null,
  status text not null default 'completed' check (status in ('completed','partially_refunded','refunded')),
  note text, created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  unique (business_id, client_uuid)
);
create index if not exists mc_saas_pos_sales_biz_date on public.mc_saas_pos_sales(business_id, created_at desc);
create index if not exists mc_saas_pos_sales_shift on public.mc_saas_pos_sales(shift_id);
create index if not exists mc_saas_pos_sales_customer on public.mc_saas_pos_sales(customer_id);

-- 6) Customer debt payments
create table if not exists public.mc_saas_pos_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  client_uuid uuid not null,
  customer_id uuid not null references public.mc_saas_pos_customers(id) on delete cascade,
  shift_id uuid references public.mc_saas_pos_shifts(id) on delete set null,
  cashier_id uuid references public.mc_saas_pos_cashiers(id) on delete set null, cashier_name text,
  amount_usd numeric not null check (amount_usd > 0),
  paid_usd numeric not null default 0, paid_lbp numeric not null default 0, paid_card numeric not null default 0, rate numeric not null,
  note text, created_at timestamptz not null default now(),
  unique (business_id, client_uuid)
);
create index if not exists mc_saas_pos_payments_biz on public.mc_saas_pos_payments(business_id, created_at desc);

-- 7) Accounting inputs: expenses, other income, cash in / cash out
create table if not exists public.mc_saas_pos_cash_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  client_uuid uuid not null,
  kind text not null check (kind in ('expense','income','cash_in','cash_out')),
  category text not null default 'General',
  amount_usd numeric not null check (amount_usd > 0),
  paid_usd numeric not null default 0, paid_lbp numeric not null default 0, rate numeric not null,
  from_drawer boolean not null default true,
  entry_date date not null default current_date,
  shift_id uuid references public.mc_saas_pos_shifts(id) on delete set null,
  cashier_id uuid references public.mc_saas_pos_cashiers(id) on delete set null, cashier_name text,
  note text, created_at timestamptz not null default now(),
  unique (business_id, client_uuid)
);
create index if not exists mc_saas_pos_cash_entries_biz on public.mc_saas_pos_cash_entries(business_id, entry_date desc);

-- 8) Security: read for business managers; writes only through the functions below
--    (settings and customer details can be edited directly by managers).
alter table public.mc_saas_pos_settings enable row level security;
alter table public.mc_saas_pos_cashiers enable row level security;
alter table public.mc_saas_pos_customers enable row level security;
alter table public.mc_saas_pos_shifts enable row level security;
alter table public.mc_saas_pos_sales enable row level security;
alter table public.mc_saas_pos_payments enable row level security;
alter table public.mc_saas_pos_cash_entries enable row level security;
revoke all on public.mc_saas_pos_settings, public.mc_saas_pos_cashiers, public.mc_saas_pos_customers, public.mc_saas_pos_shifts,
  public.mc_saas_pos_sales, public.mc_saas_pos_payments, public.mc_saas_pos_cash_entries from anon, authenticated;
grant select on public.mc_saas_pos_settings, public.mc_saas_pos_customers, public.mc_saas_pos_shifts,
  public.mc_saas_pos_sales, public.mc_saas_pos_payments, public.mc_saas_pos_cash_entries to authenticated;
grant select (id, business_id, name, role, is_active, created_at) on public.mc_saas_pos_cashiers to authenticated;
grant insert, update on public.mc_saas_pos_settings to authenticated;
grant insert (business_id, name, phone, email, address, note, credit_limit), update (name, phone, email, address, note, credit_limit, updated_at) on public.mc_saas_pos_customers to authenticated;
do $$ declare t text; begin
  foreach t in array array['mc_saas_pos_settings','mc_saas_pos_cashiers','mc_saas_pos_customers','mc_saas_pos_shifts','mc_saas_pos_sales','mc_saas_pos_payments','mc_saas_pos_cash_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.mc_saas_can_manage(business_id))', t || '_read', t);
  end loop;
end $$;
drop policy if exists mc_saas_pos_settings_write on public.mc_saas_pos_settings;
create policy mc_saas_pos_settings_write on public.mc_saas_pos_settings for insert to authenticated with check (public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_pos_settings_update on public.mc_saas_pos_settings;
create policy mc_saas_pos_settings_update on public.mc_saas_pos_settings for update to authenticated using (public.mc_saas_can_manage(business_id)) with check (public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_pos_customers_insert on public.mc_saas_pos_customers;
create policy mc_saas_pos_customers_insert on public.mc_saas_pos_customers for insert to authenticated with check (public.mc_saas_can_manage(business_id));
drop policy if exists mc_saas_pos_customers_update on public.mc_saas_pos_customers;
create policy mc_saas_pos_customers_update on public.mc_saas_pos_customers for update to authenticated using (public.mc_saas_can_manage(business_id)) with check (public.mc_saas_can_manage(business_id));
insert into public.mc_saas_pos_settings(business_id) select id from public.mc_saas_businesses on conflict do nothing;

-- 9) Helpers
create or replace function public.mc_saas_pos_guard(p_business_id uuid)
returns void language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied. Sign in with an account of this business.'; end if;
  if not exists (select 1 from public.mc_saas_businesses where id = p_business_id and pos_enabled) then
    raise exception 'The POS is not active for this business. Contact the platform owner to activate your POS plan.';
  end if;
end $$;

create or replace function public.mc_saas_pos_cashier_name(p_business_id uuid, p_cashier_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if p_cashier_id is null then return 'Owner'; end if;
  select name into v from public.mc_saas_pos_cashiers where id = p_cashier_id and business_id = p_business_id and is_active;
  if v is null then raise exception 'Cashier not found or disabled.'; end if;
  return v;
end $$;

-- unit factor (base units per sold unit); null when the unit has no verified size
create or replace function public.mc_saas_pos_unit_factor(p_business_id uuid, p_product_id uuid, p_unit text)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select u.conversion_to_base from public.mc_saas_product_units u
   where u.business_id = p_business_id and u.product_id = p_product_id and u.is_active
     and lower(trim(u.unit_name)) = lower(trim(coalesce(p_unit,''))) and (u.is_base_unit or u.conversion_configured)
   order by u.is_base_unit desc limit 1
$$;

-- move stock for a tracked product (negative = out). Returns true when stock changed.
create or replace function public.mc_saas_pos_move_stock(p_business_id uuid, p_product_id uuid, p_unit text, p_qty numeric, p_type text, p_ref text, p_note text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare f numeric;
begin
  if p_product_id is null or p_qty = 0 then return false; end if;
  f := public.mc_saas_pos_unit_factor(p_business_id, p_product_id, p_unit);
  if f is null then return false; end if;
  update public.mc_saas_product_stock set physical_qty_base = greatest(0, physical_qty_base + p_qty * f), updated_at = now()
   where business_id = p_business_id and product_id = p_product_id and stock_initialized;
  if not found then return false; end if;
  insert into public.mc_saas_stock_movements(business_id, product_id, movement_type, quantity_base, reference_type, reference_id, note, created_by)
  values (p_business_id, p_product_id, p_type, p_qty * f, 'pos', p_ref, p_note, auth.uid());
  return true;
end $$;

-- 10) Cashiers
create or replace function public.mc_saas_pos_save_cashier(p_business_id uuid, p_id uuid, p_name text, p_pin text, p_role text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public, extensions, auth, pg_temp as $$
declare v_id uuid; c record;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  if not exists (select 1 from public.mc_saas_members where business_id = p_business_id and user_id = auth.uid() and role in ('owner','admin')) then
    raise exception 'Only the business owner or an admin can manage cashiers.'; end if;
  if p_role not in ('cashier','manager') then raise exception 'Role must be cashier or manager.'; end if;
  if p_pin is not null and p_pin <> '' then
    if p_pin !~ '^\d{4,8}$' then raise exception 'PIN must be 4 to 8 digits.'; end if;
    for c in select id, pin_hash from public.mc_saas_pos_cashiers where business_id = p_business_id and is_active and id is distinct from p_id loop
      if c.pin_hash = crypt(p_pin, c.pin_hash) then raise exception 'Another cashier already uses this PIN.'; end if;
    end loop;
  end if;
  if p_id is null then
    if p_pin is null or p_pin = '' then raise exception 'Choose a PIN for the new cashier.'; end if;
    insert into public.mc_saas_pos_cashiers(business_id, name, pin_hash, role, is_active)
    values (p_business_id, trim(p_name), crypt(p_pin, gen_salt('bf')), p_role, coalesce(p_active, true)) returning id into v_id;
  else
    update public.mc_saas_pos_cashiers set name = trim(p_name), role = p_role, is_active = coalesce(p_active, true),
      pin_hash = case when coalesce(p_pin,'') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end
     where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'Cashier not found.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.mc_saas_pos_pin_login(p_business_id uuid, p_pin text)
returns table(id uuid, name text, role text) language plpgsql security definer set search_path = public, extensions, auth, pg_temp as $$
begin
  perform public.mc_saas_pos_guard(p_business_id);
  if coalesce(p_pin,'') !~ '^\d{4,8}$' then raise exception 'Wrong PIN.'; end if;
  return query select c.id, c.name, c.role from public.mc_saas_pos_cashiers c
    where c.business_id = p_business_id and c.is_active and c.pin_hash = crypt(p_pin, c.pin_hash) limit 1;
  if not found then raise exception 'Wrong PIN.'; end if;
end $$;

-- manager approval: a manager PIN, a manager cashier, or the owner when no managers exist
create or replace function public.mc_saas_pos_manager_ok(p_business_id uuid, p_cashier_id uuid, p_manager_pin text)
returns boolean language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not exists (select 1 from public.mc_saas_pos_cashiers where business_id = p_business_id and is_active and role = 'manager') then return true; end if;
  if p_cashier_id is not null and exists (select 1 from public.mc_saas_pos_cashiers where id = p_cashier_id and business_id = p_business_id and is_active and role = 'manager') then return true; end if;
  if p_cashier_id is null and exists (select 1 from public.mc_saas_members where business_id = p_business_id and user_id = auth.uid() and role in ('owner','admin')) and coalesce(p_manager_pin,'') = '' then return true; end if;
  return exists (select 1 from public.mc_saas_pos_cashiers where business_id = p_business_id and is_active and role = 'manager'
                  and coalesce(p_manager_pin,'') ~ '^\d{4,8}$' and pin_hash = crypt(p_manager_pin, pin_hash));
end $$;

-- 11) Shifts
create or replace function public.mc_saas_pos_open_shift(p_business_id uuid, p_cashier_id uuid, p_opening_usd numeric, p_opening_lbp numeric)
returns public.mc_saas_pos_shifts language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare s public.mc_saas_pos_shifts; v_name text;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_name := public.mc_saas_pos_cashier_name(p_business_id, p_cashier_id);
  select * into s from public.mc_saas_pos_shifts where business_id = p_business_id and status = 'open' and cashier_id is not distinct from p_cashier_id order by opened_at desc limit 1;
  if found then return s; end if;
  insert into public.mc_saas_pos_shifts(business_id, cashier_id, cashier_name, opening_usd, opening_lbp)
  values (p_business_id, p_cashier_id, v_name, greatest(coalesce(p_opening_usd,0),0), greatest(coalesce(p_opening_lbp,0),0)) returning * into s;
  return s;
end $$;

create or replace function public.mc_saas_pos_shift_summary(p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.mc_saas_pos_shifts; r jsonb; cu numeric; cl numeric;
begin
  select * into s from public.mc_saas_pos_shifts where id = p_shift_id;
  if not found or not public.mc_saas_can_manage(s.business_id) then raise exception 'Shift not found.'; end if;
  select jsonb_build_object(
    'sales_count', count(*) filter (where kind = 'sale'),
    'sales_total', coalesce(sum(total) filter (where kind = 'sale'), 0),
    'returns_total', coalesce(-sum(total) filter (where kind = 'return'), 0),
    'discounts', coalesce(sum(discount) filter (where kind = 'sale'), 0),
    'tax', coalesce(sum(tax), 0),
    'card', coalesce(sum(paid_card), 0),
    'credit', coalesce(sum(credit_amount), 0),
    'cash_usd', coalesce(sum(paid_usd - change_usd), 0),
    'cash_lbp', coalesce(sum(paid_lbp - change_lbp), 0),
    'cost', coalesce(sum(cost_total), 0)) into r
  from public.mc_saas_pos_sales where shift_id = p_shift_id;
  select coalesce(sum(paid_usd),0), coalesce(sum(paid_lbp),0) into cu, cl from public.mc_saas_pos_payments where shift_id = p_shift_id;
  r := r || jsonb_build_object('debt_payments_usd', cu, 'debt_payments_lbp', cl,
    'debt_payments_total', (select coalesce(sum(amount_usd),0) from public.mc_saas_pos_payments where shift_id = p_shift_id));
  select coalesce(sum(case when kind in ('income','cash_in') then paid_usd else -paid_usd end),0),
         coalesce(sum(case when kind in ('income','cash_in') then paid_lbp else -paid_lbp end),0) into cu, cl
    from public.mc_saas_pos_cash_entries where shift_id = p_shift_id and from_drawer;
  r := r || jsonb_build_object('drawer_entries_usd', cu, 'drawer_entries_lbp', cl,
    'expenses', (select coalesce(sum(amount_usd),0) from public.mc_saas_pos_cash_entries where shift_id = p_shift_id and kind = 'expense'),
    'income', (select coalesce(sum(amount_usd),0) from public.mc_saas_pos_cash_entries where shift_id = p_shift_id and kind = 'income'));
  r := r || jsonb_build_object(
    'expected_usd', s.opening_usd + (r->>'cash_usd')::numeric + (r->>'debt_payments_usd')::numeric + (r->>'drawer_entries_usd')::numeric,
    'expected_lbp', s.opening_lbp + (r->>'cash_lbp')::numeric + (r->>'debt_payments_lbp')::numeric + (r->>'drawer_entries_lbp')::numeric,
    'opening_usd', s.opening_usd, 'opening_lbp', s.opening_lbp);
  return r;
end $$;

create or replace function public.mc_saas_pos_close_shift(p_shift_id uuid, p_counted_usd numeric, p_counted_lbp numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare s public.mc_saas_pos_shifts; r jsonb;
begin
  select * into s from public.mc_saas_pos_shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift not found.'; end if;
  perform public.mc_saas_pos_guard(s.business_id);
  if s.status = 'closed' then return s.totals; end if;
  r := public.mc_saas_pos_shift_summary(p_shift_id);
  r := r || jsonb_build_object('counted_usd', coalesce(p_counted_usd,0), 'counted_lbp', coalesce(p_counted_lbp,0),
    'difference_usd', coalesce(p_counted_usd,0) - (r->>'expected_usd')::numeric,
    'difference_lbp', coalesce(p_counted_lbp,0) - (r->>'expected_lbp')::numeric);
  update public.mc_saas_pos_shifts set status = 'closed', closed_at = now(), counted_usd = coalesce(p_counted_usd,0), counted_lbp = coalesce(p_counted_lbp,0),
    expected_usd = (r->>'expected_usd')::numeric, expected_lbp = (r->>'expected_lbp')::numeric, totals = r, note = left(p_note, 500)
   where id = p_shift_id;
  return r;
end $$;

-- 12) Record a sale (idempotent by client_uuid, so offline sales can be re-sent safely)
create or replace function public.mc_saas_pos_record_sale(p_business_id uuid, p_sale jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  st public.mc_saas_pos_settings; v_uuid uuid; v_existing public.mc_saas_pos_sales; it jsonb; v_items jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_line numeric; v_qty numeric; v_price numeric; v_ldisc numeric; v_disc numeric; v_tax numeric; v_total numeric;
  v_rate numeric; v_pu numeric; v_pl numeric; v_pc numeric; v_cr numeric; v_paid numeric; v_chg numeric; v_chl numeric; v_chu numeric;
  v_cost numeric := 0; v_cost_known boolean := true; v_pcost numeric; v_f numeric; v_pid uuid; v_pname text; v_pcp numeric; v_cust public.mc_saas_pos_customers;
  v_shift uuid; v_cashier uuid; v_cname text; v_no bigint; v_label text; v_id uuid; v_order uuid; v_skip_stock boolean := false; v_method text;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := (p_sale->>'client_uuid')::uuid;
  if v_uuid is null then raise exception 'Missing sale id.'; end if;
  select * into v_existing from public.mc_saas_pos_sales where business_id = p_business_id and client_uuid = v_uuid;
  if found then return jsonb_build_object('id', v_existing.id, 'invoice_no', v_existing.invoice_no, 'invoice_label', v_existing.invoice_label, 'duplicate', true); end if;
  insert into public.mc_saas_pos_settings(business_id) values (p_business_id) on conflict do nothing;
  select * into st from public.mc_saas_pos_settings where business_id = p_business_id;
  v_cashier := nullif(p_sale->>'cashier_id','')::uuid; v_cname := public.mc_saas_pos_cashier_name(p_business_id, v_cashier);
  v_shift := nullif(p_sale->>'shift_id','')::uuid;
  if v_shift is not null and not exists (select 1 from public.mc_saas_pos_shifts where id = v_shift and business_id = p_business_id) then v_shift := null; end if;
  if jsonb_typeof(p_sale->'items') <> 'array' or jsonb_array_length(p_sale->'items') not between 1 and 500 then raise exception 'The sale must have between 1 and 500 lines.'; end if;
  for it in select value from jsonb_array_elements(p_sale->'items') loop
    v_qty := coalesce((it->>'qty')::numeric, 0); v_price := coalesce((it->>'price')::numeric, -1); v_ldisc := greatest(coalesce((it->>'discount')::numeric, 0), 0);
    if v_qty <= 0 or v_qty > 1000000 then raise exception 'Invalid quantity for %.', coalesce(it->>'name','an item'); end if;
    if v_price < 0 then raise exception 'Missing price for %.', coalesce(it->>'name','an item'); end if;
    v_line := round(v_qty * v_price - v_ldisc, 2);
    if v_line < 0 then raise exception 'Discount is bigger than the line for %.', coalesce(it->>'name','an item'); end if;
    v_pcost := null; v_pid := null; v_pname := null; v_pcp := null;
    if nullif(it->>'product_id','') is not null then
      select id, name, cost_price into v_pid, v_pname, v_pcp from public.mc_saas_products where id = (it->>'product_id')::uuid and business_id = p_business_id;
      if v_pid is null then raise exception 'A product in this sale no longer exists. Refresh the products.'; end if;
      if v_pcp is not null then
        if coalesce(it->>'unit_index','1') = '1' then v_pcost := v_pcp;
        else v_f := public.mc_saas_pos_unit_factor(p_business_id, v_pid, it->>'unit');
             v_pcost := case when v_f is not null then v_pcp * v_f end; end if;
      end if;
    end if;
    if v_pcost is null then v_cost_known := false; else v_cost := v_cost + v_pcost * v_qty; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_pid, 'name', left(coalesce(nullif(it->>'name',''), v_pname, 'Item'), 200),
      'unit', left(coalesce(it->>'unit',''), 40), 'unit_index', coalesce((it->>'unit_index')::int, 1), 'qty', v_qty, 'price', v_price,
      'discount', v_ldisc, 'line_total', v_line, 'cost', v_pcost, 'barcode', it->>'barcode', 'category', it->>'category'));
    v_sub := v_sub + v_line;
  end loop;
  v_disc := least(greatest(coalesce((p_sale->>'discount')::numeric, 0), 0), v_sub);
  v_tax := round((v_sub - v_disc) * st.tax_rate / 100, 2);
  v_total := round(v_sub - v_disc + v_tax, 2);
  v_rate := coalesce(nullif((p_sale->>'rate')::numeric, 0), st.lbp_rate);
  v_pu := greatest(coalesce((p_sale->>'paid_usd')::numeric, 0), 0); v_pl := greatest(coalesce((p_sale->>'paid_lbp')::numeric, 0), 0);
  v_pc := greatest(coalesce((p_sale->>'paid_card')::numeric, 0), 0); v_cr := greatest(coalesce((p_sale->>'credit_amount')::numeric, 0), 0);
  v_paid := v_pu + v_pl / v_rate + v_pc + v_cr;
  if v_paid + 0.01 < v_total then raise exception 'Payment is not complete: % USD still to pay.', round(v_total - v_paid, 2); end if;
  if v_pc > v_total + 0.01 then raise exception 'Card amount cannot be more than the total.'; end if;
  v_chg := greatest(round(v_paid - v_total, 2), 0);
  if v_pl > 0 and v_chg > 0 and v_chg <= st.round_lbp / v_rate + 0.005 then v_chg := 0; end if;  -- LBP rounding, not real change
  if v_chg > 0 and v_pu + v_pl = 0 then v_chg := 0; v_cr := greatest(v_total - v_pc - v_pu - v_pl / v_rate, 0); end if;
  v_chl := least(greatest(coalesce((p_sale->>'change_lbp')::numeric, 0), 0), v_chg * v_rate);
  v_chu := round(v_chg - v_chl / v_rate, 2);
  if v_cr > 0 then
    select * into v_cust from public.mc_saas_pos_customers where id = nullif(p_sale->>'customer_id','')::uuid and business_id = p_business_id for update;
    if v_cust.id is null then raise exception 'Choose a customer to sell on credit (debt).'; end if;
    if v_cust.credit_limit is not null and v_cust.balance + v_cr > v_cust.credit_limit + 0.01 then
      raise exception '% would go over the credit limit (% USD).', v_cust.name, v_cust.credit_limit; end if;
  elsif nullif(p_sale->>'customer_id','') is not null then
    select * into v_cust from public.mc_saas_pos_customers where id = (p_sale->>'customer_id')::uuid and business_id = p_business_id;
  end if;
  v_method := case when v_cr > 0 and v_pu + v_pl + v_pc = 0 then 'credit'
                   when (v_pu > 0 or v_pl > 0)::int + (v_pc > 0)::int + (v_cr > 0)::int > 1 then 'mixed'
                   when v_pc > 0 then 'card' else 'cash' end;
  update public.mc_saas_pos_settings set next_invoice_no = next_invoice_no + 1, updated_at = now() where business_id = p_business_id returning next_invoice_no - 1 into v_no;
  v_label := st.invoice_prefix || '-' || lpad(v_no::text, 6, '0');
  v_order := nullif(p_sale->>'order_id','')::uuid;
  if v_order is not null then
    if not exists (select 1 from public.mc_saas_orders where id = v_order and business_id = p_business_id) then v_order := null;
    else v_skip_stock := exists (select 1 from public.mc_saas_stock_reservations where order_id = v_order and status in ('reserved','exception')); end if;
  end if;
  insert into public.mc_saas_pos_sales(business_id, client_uuid, kind, invoice_no, invoice_label, shift_id, cashier_id, cashier_name, customer_id, customer_name,
    order_id, items, subtotal, discount, tax, total, cost_total, rate, paid_usd, paid_lbp, paid_card, credit_amount, change_usd, change_lbp, payment_method, note, created_at)
  values (p_business_id, v_uuid, 'sale', v_no, v_label, v_shift, v_cashier, v_cname, v_cust.id, v_cust.name, v_order, v_items, v_sub, v_disc, v_tax, v_total,
    case when v_cost_known then round(v_cost, 4) end, v_rate, v_pu, v_pl, v_pc, v_cr, v_chu, v_chl, v_method, left(p_sale->>'note', 500),
    coalesce(least((p_sale->>'created_at')::timestamptz, now()), now()))
  returning id into v_id;
  if v_cr > 0 then update public.mc_saas_pos_customers set balance = balance + v_cr, updated_at = now() where id = v_cust.id; end if;
  if not v_skip_stock then
    for it in select value from jsonb_array_elements(v_items) loop
      perform public.mc_saas_pos_move_stock(p_business_id, nullif(it->>'product_id','')::uuid, it->>'unit', -(it->>'qty')::numeric, 'pos_sale', v_id::text, 'POS sale ' || v_label);
    end loop;
  end if;
  if v_order is not null then
    update public.mc_saas_orders set order_status = 'delivered', payment_status = case when v_cr > 0 then 'partial' else 'paid' end, updated_at = now()
     where id = v_order and order_status <> 'delivered';
  end if;
  return jsonb_build_object('id', v_id, 'invoice_no', v_no, 'invoice_label', v_label, 'total', v_total, 'change_usd', v_chu, 'change_lbp', v_chl, 'duplicate', false);
end $$;

-- 13) Returns (manager approval when the business has managers)
create or replace function public.mc_saas_pos_record_return(p_business_id uuid, p_return jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  s public.mc_saas_pos_sales; st public.mc_saas_pos_settings; v_uuid uuid; v_ex public.mc_saas_pos_sales; it jsonb; orig jsonb;
  v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_line numeric; v_qty numeric; v_sold numeric; v_back numeric; v_ratio numeric;
  v_cashier uuid; v_cname text; v_shift uuid; v_no bigint; v_label text; v_id uuid; v_method text; v_rate numeric;
  v_pu numeric := 0; v_pl numeric := 0; v_pc numeric := 0; v_cr numeric := 0; v_restock boolean; v_cost numeric := 0; v_all boolean;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := (p_return->>'client_uuid')::uuid;
  select * into v_ex from public.mc_saas_pos_sales where business_id = p_business_id and client_uuid = v_uuid;
  if found then return jsonb_build_object('id', v_ex.id, 'invoice_label', v_ex.invoice_label, 'duplicate', true); end if;
  select * into s from public.mc_saas_pos_sales where id = (p_return->>'sale_id')::uuid and business_id = p_business_id and kind = 'sale' for update;
  if not found then raise exception 'Original sale not found.'; end if;
  v_cashier := nullif(p_return->>'cashier_id','')::uuid; v_cname := public.mc_saas_pos_cashier_name(p_business_id, v_cashier);
  if not public.mc_saas_pos_manager_ok(p_business_id, v_cashier, p_return->>'manager_pin') then raise exception 'A manager PIN is needed for returns.'; end if;
  select * into st from public.mc_saas_pos_settings where business_id = p_business_id;
  v_shift := nullif(p_return->>'shift_id','')::uuid; v_restock := coalesce((p_return->>'restock')::boolean, true);
  v_ratio := case when s.subtotal > 0 then s.total / s.subtotal else 1 end;   -- spread cart discount and tax over the lines
  for it in select value from jsonb_array_elements(p_return->'items') loop
    v_qty := coalesce((it->>'qty')::numeric, 0); if v_qty <= 0 then continue; end if;
    orig := s.items -> ((it->>'line')::int);
    if orig is null then raise exception 'Unknown line in the original sale.'; end if;
    select coalesce(sum((x->>'qty')::numeric), 0) into v_back
      from public.mc_saas_pos_sales r, jsonb_array_elements(r.items) x
     where r.ref_sale_id = s.id and r.kind = 'return' and (x->>'line')::int = (it->>'line')::int;
    v_sold := (orig->>'qty')::numeric;
    if v_qty > v_sold - v_back + 0.0001 then raise exception 'Only % of % can still be returned.', v_sold - v_back, orig->>'name'; end if;
    v_line := round((orig->>'line_total')::numeric / v_sold * v_qty * v_ratio, 2);
    v_total := v_total + v_line;
    v_cost := v_cost + coalesce((orig->>'cost')::numeric, 0) * v_qty;
    v_items := v_items || jsonb_build_array(orig || jsonb_build_object('line', (it->>'line')::int, 'qty', v_qty, 'line_total', -v_line, 'discount', 0));
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'Choose at least one item to return.'; end if;
  v_rate := coalesce(nullif((p_return->>'rate')::numeric,0), st.lbp_rate);
  v_method := coalesce(p_return->>'refund_method', 'cash_usd');
  if v_method = 'cash_usd' then v_pu := v_total;
  elsif v_method = 'cash_lbp' then v_pl := round(v_total * v_rate / st.round_lbp) * st.round_lbp;
  elsif v_method = 'card' then v_pc := v_total;
  elsif v_method = 'credit' then
    if s.customer_id is null then raise exception 'This sale has no customer, so it cannot be returned to a customer account.'; end if;
    v_cr := v_total;
  else raise exception 'Unknown refund method.'; end if;
  update public.mc_saas_pos_settings set next_invoice_no = next_invoice_no + 1 where business_id = p_business_id returning next_invoice_no - 1 into v_no;
  v_label := 'RET-' || lpad(v_no::text, 6, '0');
  insert into public.mc_saas_pos_sales(business_id, client_uuid, kind, invoice_no, invoice_label, ref_sale_id, shift_id, cashier_id, cashier_name, customer_id, customer_name,
    items, subtotal, discount, tax, total, cost_total, rate, paid_usd, paid_lbp, paid_card, credit_amount, payment_method, note)
  values (p_business_id, v_uuid, 'return', v_no, v_label, s.id, v_shift, v_cashier, v_cname, s.customer_id, s.customer_name,
    v_items, -v_total, 0, 0, -v_total, case when s.cost_total is not null then -round(v_cost,4) end, v_rate, -v_pu, -v_pl, -v_pc, -v_cr,
    case when v_method like 'cash%' then 'cash' else v_method end, left(p_return->>'reason', 500))
  returning id into v_id;
  if v_cr > 0 then update public.mc_saas_pos_customers set balance = balance - v_cr, updated_at = now() where id = s.customer_id; end if;
  if v_restock then
    for it in select value from jsonb_array_elements(v_items) loop
      perform public.mc_saas_pos_move_stock(p_business_id, nullif(it->>'product_id','')::uuid, it->>'unit', (it->>'qty')::numeric, 'return', v_id::text, 'POS return ' || v_label);
    end loop;
  end if;
  select bool_and(((x->>'qty')::numeric) <= coalesce((select sum((y->>'qty')::numeric) from public.mc_saas_pos_sales r, jsonb_array_elements(r.items) y
           where r.ref_sale_id = s.id and r.kind = 'return' and (y->>'line')::int = (t.ord - 1)), 0) + 0.0001)
    into v_all from jsonb_array_elements(s.items) with ordinality t(x, ord);
  update public.mc_saas_pos_sales set status = case when v_all then 'refunded' else 'partially_refunded' end where id = s.id;
  return jsonb_build_object('id', v_id, 'invoice_label', v_label, 'refund_usd', v_total, 'refund_lbp', v_pl, 'duplicate', false);
end $$;

-- 14) Customer debt payment
create or replace function public.mc_saas_pos_customer_payment(p_business_id uuid, p_pay jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_uuid uuid; c public.mc_saas_pos_customers; st public.mc_saas_pos_settings; v_rate numeric; v_pu numeric; v_pl numeric; v_pc numeric; v_amt numeric;
  v_cashier uuid; v_id uuid;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := (p_pay->>'client_uuid')::uuid;
  select id into v_id from public.mc_saas_pos_payments where business_id = p_business_id and client_uuid = v_uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  select * into c from public.mc_saas_pos_customers where id = (p_pay->>'customer_id')::uuid and business_id = p_business_id for update;
  if not found then raise exception 'Customer not found.'; end if;
  select * into st from public.mc_saas_pos_settings where business_id = p_business_id;
  v_rate := coalesce(nullif((p_pay->>'rate')::numeric,0), st.lbp_rate);
  v_pu := greatest(coalesce((p_pay->>'paid_usd')::numeric,0),0); v_pl := greatest(coalesce((p_pay->>'paid_lbp')::numeric,0),0); v_pc := greatest(coalesce((p_pay->>'paid_card')::numeric,0),0);
  v_amt := round(v_pu + v_pl / v_rate + v_pc, 2);
  if v_amt <= 0 then raise exception 'Enter the amount received.'; end if;
  v_cashier := nullif(p_pay->>'cashier_id','')::uuid;
  insert into public.mc_saas_pos_payments(business_id, client_uuid, customer_id, shift_id, cashier_id, cashier_name, amount_usd, paid_usd, paid_lbp, paid_card, rate, note)
  values (p_business_id, v_uuid, c.id, nullif(p_pay->>'shift_id','')::uuid, v_cashier, public.mc_saas_pos_cashier_name(p_business_id, v_cashier),
          v_amt, v_pu, v_pl, v_pc, v_rate, left(p_pay->>'note', 500)) returning id into v_id;
  update public.mc_saas_pos_customers set balance = balance - v_amt, updated_at = now() where id = c.id;
  return jsonb_build_object('id', v_id, 'amount_usd', v_amt, 'balance', c.balance - v_amt, 'duplicate', false);
end $$;

-- 15) Expenses, other income, cash in / out
create or replace function public.mc_saas_pos_cash_entry(p_business_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_uuid uuid; st public.mc_saas_pos_settings; v_rate numeric; v_pu numeric; v_pl numeric; v_amt numeric; v_id uuid; v_cashier uuid;
begin
  perform public.mc_saas_pos_guard(p_business_id);
  v_uuid := (p_entry->>'client_uuid')::uuid;
  select id into v_id from public.mc_saas_pos_cash_entries where business_id = p_business_id and client_uuid = v_uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if coalesce(p_entry->>'kind','') not in ('expense','income','cash_in','cash_out') then raise exception 'Choose expense, income, cash in or cash out.'; end if;
  select * into st from public.mc_saas_pos_settings where business_id = p_business_id;
  v_rate := coalesce(nullif((p_entry->>'rate')::numeric,0), st.lbp_rate);
  v_pu := greatest(coalesce((p_entry->>'paid_usd')::numeric,0),0); v_pl := greatest(coalesce((p_entry->>'paid_lbp')::numeric,0),0);
  v_amt := round(v_pu + v_pl / v_rate, 2);
  if v_amt <= 0 then raise exception 'Enter an amount.'; end if;
  v_cashier := nullif(p_entry->>'cashier_id','')::uuid;
  insert into public.mc_saas_pos_cash_entries(business_id, client_uuid, kind, category, amount_usd, paid_usd, paid_lbp, rate, from_drawer, entry_date, shift_id, cashier_id, cashier_name, note)
  values (p_business_id, v_uuid, p_entry->>'kind', left(coalesce(nullif(trim(p_entry->>'category'),''),'General'), 60), v_amt, v_pu, v_pl, v_rate,
          coalesce((p_entry->>'from_drawer')::boolean, true), coalesce((p_entry->>'entry_date')::date, current_date),
          nullif(p_entry->>'shift_id','')::uuid, v_cashier, public.mc_saas_pos_cashier_name(p_business_id, v_cashier), left(p_entry->>'note', 500))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount_usd', v_amt, 'duplicate', false);
end $$;

-- 16) Permissions on functions
do $$ declare f text; begin
  foreach f in array array['mc_saas_pos_guard(uuid)','mc_saas_pos_cashier_name(uuid,uuid)','mc_saas_pos_unit_factor(uuid,uuid,text)',
    'mc_saas_pos_move_stock(uuid,uuid,text,numeric,text,text,text)','mc_saas_pos_manager_ok(uuid,uuid,text)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['mc_saas_pos_save_cashier(uuid,uuid,text,text,text,boolean)','mc_saas_pos_pin_login(uuid,text)',
    'mc_saas_pos_open_shift(uuid,uuid,numeric,numeric)','mc_saas_pos_shift_summary(uuid)','mc_saas_pos_close_shift(uuid,numeric,numeric,text)',
    'mc_saas_pos_record_sale(uuid,jsonb)','mc_saas_pos_record_return(uuid,jsonb)','mc_saas_pos_customer_payment(uuid,jsonb)','mc_saas_pos_cash_entry(uuid,jsonb)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

-- 17) Platform owner: switch Catalogue / POS per business
create or replace function public.mc_saas_platform_set_modules(p_business_id uuid, p_catalogue boolean, p_pos boolean)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  update public.mc_saas_businesses set catalogue_enabled = coalesce(p_catalogue, catalogue_enabled), pos_enabled = coalesce(p_pos, pos_enabled), updated_at = now() where id = p_business_id;
  return found;
end $$;
revoke all on function public.mc_saas_platform_set_modules(uuid,boolean,boolean) from public, anon;
grant execute on function public.mc_saas_platform_set_modules(uuid,boolean,boolean) to authenticated;

-- 18) Rounding: an LBP payment rounded up is not change
--     (applied in mc_saas_pos_record_sale above)

-- 19) Platform owner: list Catalogue / POS per business; storefront can see whether the catalogue is on
create or replace function public.mc_saas_platform_business_modules()
returns table(business_id uuid, catalogue_enabled boolean, pos_enabled boolean, pos_sales_30d integer)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.mc_saas_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  return query select b.id, b.catalogue_enabled, b.pos_enabled,
    (select count(*)::int from public.mc_saas_pos_sales s where s.business_id = b.id and s.created_at > now() - interval '30 days')
    from public.mc_saas_businesses b;
end $$;
revoke all on function public.mc_saas_platform_business_modules() from public, anon;
grant execute on function public.mc_saas_platform_business_modules() to authenticated;
grant select (catalogue_enabled) on public.mc_saas_businesses to anon;
