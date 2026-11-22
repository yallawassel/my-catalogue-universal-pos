-- V18: optional VAT in the POS + receiving stock (stock can be entered in any unit; the admin converts to the base unit).

alter table public.mc_saas_pos_settings
  add column if not exists vat_mode text not null default 'off',          -- off | optional (cashier ticks "VAT invoice") | always
  add column if not exists prices_include_vat boolean not null default false,
  add column if not exists vat_number text;
alter table public.mc_saas_pos_settings drop constraint if exists mc_saas_pos_settings_vat_mode_check;
alter table public.mc_saas_pos_settings add constraint mc_saas_pos_settings_vat_mode_check check (vat_mode in ('off','optional','always'));
update public.mc_saas_pos_settings set vat_mode = 'always' where tax_rate > 0 and vat_mode = 'off';
alter table public.mc_saas_pos_sales add column if not exists vat_rate numeric not null default 0;
alter table public.mc_saas_pos_sales add column if not exists prices_include_vat boolean not null default false;

create or replace function public.mc_saas_receive_stock(p_business_id uuid, p_product_id uuid, p_quantity_base numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_new numeric;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_quantity_base is null or p_quantity_base <= 0 or p_quantity_base > 100000000 then raise exception 'Received quantity must be more than zero.'; end if;
  if not exists (select 1 from public.mc_saas_products where id = p_product_id and business_id = p_business_id) then raise exception 'Product not found in this business.'; end if;
  insert into public.mc_saas_product_stock(business_id, product_id) values (p_business_id, p_product_id) on conflict do nothing;
  update public.mc_saas_product_stock
     set physical_qty_base = case when stock_initialized then physical_qty_base else 0 end + p_quantity_base, stock_initialized = true, updated_at = now()
   where business_id = p_business_id and product_id = p_product_id returning physical_qty_base into v_new;
  insert into public.mc_saas_stock_movements(business_id, product_id, movement_type, quantity_base, reference_type, note, created_by)
  values (p_business_id, p_product_id, 'purchase', p_quantity_base, 'manual_receive', coalesce(nullif(trim(p_note),''), 'Goods received'), auth.uid());
  return v_new;
end $$;
revoke all on function public.mc_saas_receive_stock(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.mc_saas_receive_stock(uuid,uuid,numeric,text) to authenticated;

-- VAT in sales and returns (patched into the V17 functions)
do $$ declare d text; begin
  d := pg_get_functiondef('public.mc_saas_pos_record_sale'::regproc);
  if position('v_vat boolean' in d) = 0 then
    d := replace(d, 'v_skip_stock boolean := false; v_method text;', 'v_skip_stock boolean := false; v_method text; v_vat boolean;');
    d := replace(d, 'v_tax := round((v_sub - v_disc) * st.tax_rate / 100, 2);
  v_total := round(v_sub - v_disc + v_tax, 2);',
'v_vat := (case st.vat_mode when ''always'' then true when ''optional'' then coalesce((p_sale->>''vat'')::boolean, false) else false end) and st.tax_rate > 0;
  if not v_vat then v_tax := 0; v_total := round(v_sub - v_disc, 2);
  elsif st.prices_include_vat then v_total := round(v_sub - v_disc, 2); v_tax := round(v_total - v_total / (1 + st.tax_rate / 100), 2);
  else v_tax := round((v_sub - v_disc) * st.tax_rate / 100, 2); v_total := round(v_sub - v_disc + v_tax, 2); end if;');
    d := replace(d, 'change_usd, change_lbp, payment_method, note, created_at)', 'change_usd, change_lbp, payment_method, note, created_at, vat_rate, prices_include_vat)');
    d := replace(d, 'coalesce(least((p_sale->>''created_at'')::timestamptz, now()), now()))', 'coalesce(least((p_sale->>''created_at'')::timestamptz, now()), now()), case when v_vat then st.tax_rate else 0 end, v_vat and st.prices_include_vat)');
    execute d;
  end if;
  d := pg_get_functiondef('public.mc_saas_pos_record_return'::regproc);
  if position('v_total * s.tax / s.total' in d) = 0 then
    d := replace(d, 'v_items, -v_total, 0, 0, -v_total,', 'v_items, -v_total, 0, -round(case when s.total <> 0 then v_total * s.tax / s.total else 0 end, 2), -v_total,');
    execute d;
  end if;
end $$;
