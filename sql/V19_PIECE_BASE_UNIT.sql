-- V19: the PIECE is the main stock unit for every product.
-- Stock, reservations and stock checks are kept in pieces. Each selling unit (Box, Packet, PKTS*65…)
-- is "N pieces" (products.pieces1 / pieces2). If the first unit is already a piece (Piece, Pcs, Unit…)
-- it is the base itself.

alter table public.mc_saas_products add column if not exists pieces1 numeric;
alter table public.mc_saas_products add column if not exists pieces2 numeric;
alter table public.mc_saas_products drop constraint if exists mc_saas_products_pieces_check;
alter table public.mc_saas_products add constraint mc_saas_products_pieces_check check ((pieces1 is null or pieces1 > 0) and (pieces2 is null or pieces2 > 0));

create or replace function public.mc_saas_piece_like(p text) returns boolean language sql immutable as $$
  select lower(trim(coalesce(p,''))) in ('piece','pieces','pcs','pc','pce','pcs.','unit','units','each','ea','item','قطعة','قطع','حبة','حبه')
$$;
-- "PKTS*65" -> 65, "Box x 24" -> 24, "Pack of 6" -> 6, "Carton 12pcs" -> 12
create or replace function public.mc_saas_parse_unit_size(p text) returns numeric language sql immutable as $$
  select nullif(coalesce(
    substring(lower(coalesce(p,'')) from '(?:\*|×|x|of|/)\s*(\d+(?:\.\d+)?)\s*(?:pcs|pc|pieces)?\s*$'),
    substring(lower(coalesce(p,'')) from '(\d+(?:\.\d+)?)\s*(?:pcs|pc|pieces|pce)\s*$')), '')::numeric
$$;

create or replace function public.mc_saas_sync_product_units_from_product()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l1 text := coalesce(nullif(trim(new.label1),''),'Box');
  l2 text := nullif(trim(coalesce(new.label2,'')),'');
  bc text := coalesce(nullif(trim(new.barcode),''),'');
  base_name text; s1 numeric; s2 numeric;
begin
  base_name := case when public.mc_saas_piece_like(l1) then l1 else 'Piece' end;
  if l2 is not null and (lower(l2) = lower(l1) or lower(l2) = lower(base_name)) then l2 := case when lower(l2) = lower(base_name) and lower(l1) <> lower(base_name) then l2 else null end; end if;
  s1 := case when public.mc_saas_piece_like(l1) then 1 else coalesce(new.pieces1, public.mc_saas_parse_unit_size(l1)) end;
  s2 := case when l2 is null then null when public.mc_saas_piece_like(l2) then 1 else coalesce(new.pieces2, public.mc_saas_parse_unit_size(l2)) end;
  -- 1) the base (piece) unit
  update public.mc_saas_product_units set barcode = '' where business_id = new.business_id and product_id = new.id and lower(trim(barcode)) = lower(bc) and bc <> '';
  update public.mc_saas_product_units set unit_name = base_name, conversion_to_base = 1, conversion_configured = true, is_active = true,
         selling_price = case when public.mc_saas_piece_like(l1) then new.price1 end, updated_at = now()
   where business_id = new.business_id and product_id = new.id and is_base_unit
     and not exists (select 1 from public.mc_saas_product_units x where x.business_id = new.business_id and x.product_id = new.id and not x.is_base_unit and lower(trim(x.unit_name)) = lower(base_name));
  if not found and not exists (select 1 from public.mc_saas_product_units where business_id = new.business_id and product_id = new.id and is_base_unit) then
    insert into public.mc_saas_product_units(business_id, product_id, unit_name, conversion_to_base, is_base_unit, conversion_configured, barcode, selling_price)
    values (new.business_id, new.id, base_name, 1, true, true, '', case when public.mc_saas_piece_like(l1) then new.price1 end)
    on conflict do nothing;
  end if;
  if public.mc_saas_piece_like(l1) and bc <> '' then
    update public.mc_saas_product_units set barcode = bc where business_id = new.business_id and product_id = new.id and is_base_unit;
  end if;
  -- 2) first selling unit (when it is not the piece itself)
  if not public.mc_saas_piece_like(l1) then
    insert into public.mc_saas_product_units(business_id, product_id, unit_name, conversion_to_base, is_base_unit, conversion_configured, barcode, selling_price, is_active)
    values (new.business_id, new.id, l1, coalesce(s1,1), false, s1 is not null, bc, new.price1, true)
    on conflict (business_id, product_id, lower(trim(both from unit_name))) do update
      set conversion_to_base = coalesce(s1, public.mc_saas_product_units.conversion_to_base), conversion_configured = s1 is not null or public.mc_saas_product_units.conversion_configured,
          barcode = bc, selling_price = new.price1, is_active = true, updated_at = now()
    where not public.mc_saas_product_units.is_base_unit;
  end if;
  -- 3) second selling unit
  if l2 is not null then
    insert into public.mc_saas_product_units(business_id, product_id, unit_name, conversion_to_base, is_base_unit, conversion_configured, barcode, selling_price, is_active)
    values (new.business_id, new.id, l2, coalesce(s2,1), false, s2 is not null, '', new.price2, true)
    on conflict (business_id, product_id, lower(trim(both from unit_name))) do update
      set conversion_to_base = coalesce(s2, public.mc_saas_product_units.conversion_to_base), conversion_configured = s2 is not null or public.mc_saas_product_units.conversion_configured,
          selling_price = new.price2, is_active = true, updated_at = now()
    where not public.mc_saas_product_units.is_base_unit;
  end if;
  -- 4) units that are no longer used are switched off (kept for history and POS mappings)
  update public.mc_saas_product_units set is_active = false, updated_at = now()
   where business_id = new.business_id and product_id = new.id and not is_base_unit
     and lower(trim(unit_name)) not in (lower(l1), lower(coalesce(l2, l1)));
  return new;
end $$;

-- one-time move of existing products: the old first unit (base) becomes "N pieces"
do $$ declare r record; begin
  for r in select id, business_id, label1 from public.mc_saas_products loop
    if not public.mc_saas_piece_like(coalesce(nullif(trim(r.label1),''),'Box')) then
      -- stock was counted in the old first unit; there is none yet, so nothing to scale (checked before this migration)
      update public.mc_saas_product_units set is_base_unit = false, conversion_configured = public.mc_saas_parse_unit_size(unit_name) is not null,
             conversion_to_base = coalesce(public.mc_saas_parse_unit_size(unit_name), 1), updated_at = now()
       where product_id = r.id and is_base_unit;
      update public.mc_saas_product_units set conversion_configured = public.mc_saas_parse_unit_size(unit_name) is not null,
             conversion_to_base = coalesce(public.mc_saas_parse_unit_size(unit_name), 1), updated_at = now()
       where product_id = r.id and not is_base_unit;
      insert into public.mc_saas_product_units(business_id, product_id, unit_name, conversion_to_base, is_base_unit, conversion_configured, barcode)
      values (r.business_id, r.id, 'Piece', 1, true, true, '') on conflict do nothing;
    end if;
  end loop;
  update public.mc_saas_products p set pieces1 = coalesce(p.pieces1, (select u.conversion_to_base from public.mc_saas_product_units u where u.product_id = p.id and not u.is_base_unit and u.conversion_configured and lower(trim(u.unit_name)) = lower(trim(p.label1)))),
         pieces2 = coalesce(p.pieces2, (select u.conversion_to_base from public.mc_saas_product_units u where u.product_id = p.id and not u.is_base_unit and u.conversion_configured and lower(trim(u.unit_name)) = lower(trim(p.label2))));
end $$;

-- quick size fix from the Stock page also saves the size on the product
create or replace function public.mc_saas_set_unit_conversion(p_business_id uuid, p_unit_id uuid, p_conversion_to_base numeric)
returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare u public.mc_saas_product_units;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  if p_conversion_to_base is null or p_conversion_to_base <= 0 or p_conversion_to_base > 1000000 then raise exception 'Enter a number greater than zero.'; end if;
  update public.mc_saas_product_units set conversion_to_base = p_conversion_to_base, conversion_configured = true, updated_at = now()
   where id = p_unit_id and business_id = p_business_id and not is_base_unit returning * into u;
  if u.id is null then raise exception 'Unit not found.'; end if;
  update public.mc_saas_products set pieces1 = case when lower(trim(label1)) = lower(trim(u.unit_name)) then p_conversion_to_base else pieces1 end,
         pieces2 = case when lower(trim(coalesce(label2,''))) = lower(trim(u.unit_name)) then p_conversion_to_base else pieces2 end
   where id = u.product_id;
  return true;
end $$;
