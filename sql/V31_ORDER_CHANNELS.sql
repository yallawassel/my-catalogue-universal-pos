-- v31: how customers send their order (WhatsApp, phone call, Telegram, inside Raffi). Additive.
alter table public.mc_saas_businesses
  add column if not exists order_channels jsonb not null default '{"whatsapp": true}'::jsonb;
grant select (order_channels) on public.mc_saas_businesses to anon, authenticated;

create or replace function public.mc_saas_save_order_channels(p_business_id uuid, p_channels jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','auth','pg_temp' as $$
declare c jsonb; phone text; tg text;
begin
  if auth.uid() is null or not public.mc_saas_can_manage(p_business_id) then raise exception 'Access denied.'; end if;
  phone := left(regexp_replace(coalesce(p_channels->>'phone',''), '[^0-9+]', '', 'g'), 20);
  tg := left(regexp_replace(coalesce(p_channels->>'telegram',''), '^@|[^A-Za-z0-9_]', '', 'g'), 32);
  c := jsonb_build_object(
    'whatsapp', coalesce((p_channels->>'whatsapp')::boolean, false),
    'call', coalesce((p_channels->>'call')::boolean, false) and length(phone) >= 6,
    'phone', phone,
    'telegram', case when length(tg) >= 5 then tg else '' end,
    'inapp', coalesce((p_channels->>'inapp')::boolean, false));
  if not ((c->>'whatsapp')::boolean or (c->>'call')::boolean or c->>'telegram' <> '' or (c->>'inapp')::boolean) then
    raise exception 'Choose at least one way for customers to send their order.';
  end if;
  update public.mc_saas_businesses set order_channels = c, updated_at = now() where id = p_business_id;
  return c;
end $$;
revoke all on function public.mc_saas_save_order_channels(uuid, jsonb) from public, anon;
grant execute on function public.mc_saas_save_order_channels(uuid, jsonb) to authenticated;
