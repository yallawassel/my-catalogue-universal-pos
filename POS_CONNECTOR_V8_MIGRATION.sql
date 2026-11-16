-- My Catalogue PRO v8 — Live POS connector keys
-- Additive migration for the My Catalogue Supabase project ONLY (never White Pack).
-- Take a backup first. Safe to run more than once.
-- Requires: SAAS_MIGRATION, POS_SYNC_MIGRATION, UNIVERSAL_POS_CONNECTIONS_V7_MIGRATION.
-- Optional: HYBRID_STOCK_MIGRATION (only needed for stock updates from the connector).

begin;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mc_saas_pos_agent_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.mc_saas_businesses(id) on delete cascade,
  connection_id uuid references public.mc_saas_pos_connections(id) on delete set null,
  name text not null default 'POS connector' check (length(trim(name)) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,                       -- SHA-256 hex of the full key; the key itself is never stored
  permission text not null default 'full' check (permission in ('price','full','full_stock')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_sync_summary jsonb not null default '{}'::jsonb,
  revoked_at timestamptz
);
create index if not exists mc_saas_pos_agent_keys_business on public.mc_saas_pos_agent_keys(business_id, created_at desc);

alter table public.mc_saas_pos_agent_keys enable row level security;
drop policy if exists mc_saas_pos_agent_keys_read on public.mc_saas_pos_agent_keys;
create policy mc_saas_pos_agent_keys_read on public.mc_saas_pos_agent_keys
  for select to authenticated using (public.mc_saas_can_manage(business_id));
-- Browser users can only READ key metadata. Keys are created/revoked through the RPCs below.
revoke all on public.mc_saas_pos_agent_keys from anon, authenticated;
grant select (id,business_id,connection_id,name,key_prefix,permission,created_at,last_used_at,last_sync_summary,revoked_at)
  on public.mc_saas_pos_agent_keys to authenticated;

-- Create a key. Returns the plain key ONCE.
create or replace function public.mc_saas_pos_agent_create_key(
  p_business_id uuid, p_name text, p_permission text default 'full', p_connection_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_key text; v_id uuid;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Business access required.'; end if;
  if p_permission not in ('price','full','full_stock') then raise exception 'Invalid permission.'; end if;
  if (select count(*) from public.mc_saas_pos_agent_keys where business_id = p_business_id and revoked_at is null) >= 20 then
    raise exception 'Maximum of 20 active connector keys. Revoke an unused key first.';
  end if;
  if p_connection_id is not null and not exists (select 1 from public.mc_saas_pos_connections where id = p_connection_id and business_id = p_business_id) then
    raise exception 'Connection profile not found for this business.';
  end if;
  v_key := 'mcpos_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mc_saas_pos_agent_keys(business_id, connection_id, name, key_prefix, key_hash, permission, created_by)
  values (p_business_id, p_connection_id, left(coalesce(nullif(trim(p_name), ''), 'POS connector'), 80), left(v_key, 14),
          encode(extensions.digest(v_key, 'sha256'), 'hex'), p_permission, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 14));
end $$;

create or replace function public.mc_saas_pos_agent_revoke_key(p_key_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_business uuid;
begin
  select business_id into v_business from public.mc_saas_pos_agent_keys where id = p_key_id;
  if v_business is null or auth.uid() is null or not public.mc_saas_can_manage(v_business) then raise exception 'Key not found.'; end if;
  update public.mc_saas_pos_agent_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key_id;
end $$;

-- Stock snapshot for the connector (service role only). Mirrors mc_saas_apply_pos_stock_snapshot
-- but without a signed-in user. Requires HYBRID_STOCK_MIGRATION.sql; otherwise calls fail safely.
create or replace function public.mc_saas_pos_agent_stock_snapshot(
  p_business_id uuid, p_product_unit_id uuid, p_quantity numeric, p_external_event_id text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_product uuid; v_factor numeric; v_configured boolean; v_old numeric; v_new numeric; v_event uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role access is required.'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Stock quantity must be zero or greater.'; end if;
  if coalesce(trim(p_external_event_id), '') = '' then raise exception 'An event ID is required.'; end if;
  select product_id, conversion_to_base, conversion_configured into v_product, v_factor, v_configured
    from public.mc_saas_product_units where id = p_product_unit_id and business_id = p_business_id and is_active for update;
  if v_product is null then raise exception 'Product unit not found.'; end if;
  if not v_configured then raise exception 'Configure this unit conversion before importing stock.'; end if;
  insert into public.mc_saas_stock_sync_events(business_id, source_type, external_event_id, event_type, payload)
  values (p_business_id, 'local_connector', p_external_event_id, 'stock_snapshot', jsonb_build_object('unit_id', p_product_unit_id, 'quantity', p_quantity))
  on conflict (business_id, source_type, external_event_id, event_type) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('duplicate', true); end if;
  insert into public.mc_saas_product_stock(business_id, product_id) values (p_business_id, v_product) on conflict do nothing;
  select physical_qty_base into v_old from public.mc_saas_product_stock where business_id = p_business_id and product_id = v_product for update;
  v_new := p_quantity * v_factor;
  update public.mc_saas_product_stock set physical_qty_base = v_new, stock_initialized = true, last_pos_sync_at = now(), updated_at = now()
   where business_id = p_business_id and product_id = v_product;
  insert into public.mc_saas_stock_movements(business_id, product_id, product_unit_id, movement_type, quantity_base, reference_type, reference_id, external_event_id, note, created_by)
  values (p_business_id, v_product, p_product_unit_id, 'pos_snapshot', v_new - coalesce(v_old, 0), 'pos_event', v_event::text, p_external_event_id, 'Live POS connector snapshot', null);
  update public.mc_saas_stock_sync_events set status = 'processed', result = jsonb_build_object('physical_qty_base', v_new), processed_at = now() where id = v_event;
  return jsonb_build_object('duplicate', false, 'product_id', v_product, 'physical_qty_base', v_new);
end $$;

revoke all on function public.mc_saas_pos_agent_create_key(uuid, text, text, uuid) from public;
revoke all on function public.mc_saas_pos_agent_revoke_key(uuid) from public;
revoke all on function public.mc_saas_pos_agent_stock_snapshot(uuid, uuid, numeric, text) from public;
grant execute on function public.mc_saas_pos_agent_create_key(uuid, text, text, uuid) to authenticated;
grant execute on function public.mc_saas_pos_agent_revoke_key(uuid) to authenticated;
grant execute on function public.mc_saas_pos_agent_stock_snapshot(uuid, uuid, numeric, text) to service_role;

comment on table public.mc_saas_pos_agent_keys is 'Live POS connector keys. Only SHA-256 hashes are stored; plain keys are shown once at creation.';
commit;
