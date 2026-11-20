-- V11: industry catalogue templates (chocolate, luxury, boutique, mini market, supermarket, wholesale,
-- bakery, fashion, electronics, beauty) + one RPC that saves template and brand colour together.
alter table public.mc_saas_businesses drop constraint if exists mc_saas_businesses_catalogue_template_check;
alter table public.mc_saas_businesses add constraint mc_saas_businesses_catalogue_template_check check (catalogue_template = any (array[
  'classic','premium','fresh','shopify','editorial','compact','list','showcase',
  'chocolate','luxury','boutique','minimarket','supermarket','wholesale','bakery','fashion','electronics','beauty']));

create or replace function public.mc_saas_catalogue_template_ok(p_template text) returns boolean
language sql immutable set search_path = public as $$
  select p_template = any (array['classic','premium','fresh','shopify','editorial','compact','list','showcase',
    'chocolate','luxury','boutique','minimarket','supermarket','wholesale','bakery','fashion','electronics','beauty'])
$$;

create or replace function public.mc_saas_update_catalogue_template(p_business_id uuid, p_template text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if not public.mc_saas_catalogue_template_ok(p_template) then raise exception 'Invalid catalogue template.'; end if;
  if not exists (select 1 from public.mc_saas_members m where m.business_id = p_business_id and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    raise exception 'You are not authorized to change this business catalogue.';
  end if;
  update public.mc_saas_businesses set catalogue_template = p_template, updated_at = now() where id = p_business_id;
  if not found then raise exception 'Business not found.'; end if;
  return true;
end $$;

create or replace function public.mc_saas_update_catalogue_design(p_business_id uuid, p_template text, p_primary_color text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if not public.mc_saas_catalogue_template_ok(p_template) then raise exception 'Invalid catalogue template.'; end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid brand colour.'; end if;
  if not exists (select 1 from public.mc_saas_members m where m.business_id = p_business_id and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    raise exception 'You are not authorized to change this business catalogue.';
  end if;
  update public.mc_saas_businesses set catalogue_template = p_template, primary_color = lower(p_primary_color), updated_at = now() where id = p_business_id;
  if not found then raise exception 'Business not found.'; end if;
  return true;
end $$;
revoke all on function public.mc_saas_update_catalogue_design(uuid,text,text) from public, anon;
grant execute on function public.mc_saas_update_catalogue_design(uuid,text,text) to authenticated;
revoke all on function public.mc_saas_update_catalogue_template(uuid,text) from public, anon;
grant execute on function public.mc_saas_update_catalogue_template(uuid,text) to authenticated;
