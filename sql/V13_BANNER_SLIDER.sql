-- V13: moving storefront banner — automatic or hand-picked products, optional short video.
alter table public.mc_saas_businesses
  add column if not exists banner_mode text not null default 'auto',
  add column if not exists banner_product_ids uuid[] not null default '{}',
  add column if not exists banner_video_url text,
  add column if not exists banner_headline text;
alter table public.mc_saas_businesses drop constraint if exists mc_saas_banner_mode_check;
alter table public.mc_saas_businesses add constraint mc_saas_banner_mode_check check (banner_mode in ('auto','manual','off'));
alter table public.mc_saas_businesses drop constraint if exists mc_saas_banner_limits;
alter table public.mc_saas_businesses add constraint mc_saas_banner_limits check (coalesce(array_length(banner_product_ids,1),0) <= 20 and coalesce(length(banner_headline),0) <= 120 and coalesce(length(banner_video_url),0) <= 600);
grant select (banner_mode, banner_product_ids, banner_video_url, banner_headline) on public.mc_saas_businesses to anon, authenticated;

create or replace function public.mc_saas_update_banner(p_business_id uuid, p_mode text, p_product_ids uuid[], p_video_url text, p_headline text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare v_ids uuid[]; v_prefix text;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if not exists (select 1 from public.mc_saas_members m where m.business_id = p_business_id and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    raise exception 'You are not authorized to change this business catalogue.';
  end if;
  if p_mode not in ('auto','manual','off') then raise exception 'Invalid banner mode.'; end if;
  -- keep only this business's products, in the chosen order, max 20
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_ids
    from (select u.id, min(u.ord) ord from unnest(coalesce(p_product_ids,'{}')) with ordinality u(id, ord)
           join public.mc_saas_products p on p.id = u.id and p.business_id = p_business_id group by u.id order by 2 limit 20) x;
  -- the video must be a file uploaded to this business's own video folder
  if nullif(trim(p_video_url),'') is not null then
    v_prefix := '/storage/v1/object/public/mc-saas-videos/' || p_business_id::text || '/';
    if position(v_prefix in p_video_url) = 0 or p_video_url !~ '^https://' then raise exception 'Upload the video from the admin page.'; end if;
  end if;
  update public.mc_saas_businesses
     set banner_mode = p_mode, banner_product_ids = v_ids,
         banner_video_url = nullif(trim(p_video_url),''), banner_headline = nullif(left(trim(coalesce(p_headline,'')),120),''),
         updated_at = now()
   where id = p_business_id;
  return true;
end $$;
revoke all on function public.mc_saas_update_banner(uuid,text,uuid[],text,text) from public, anon;
grant execute on function public.mc_saas_update_banner(uuid,text,uuid[],text,text) to authenticated;

-- Public bucket for short banner videos (max 15 MB), one folder per business.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mc-saas-videos','mc-saas-videos', true, 15728640, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mc_saas_video_insert on storage.objects;
drop policy if exists mc_saas_video_update on storage.objects;
drop policy if exists mc_saas_video_delete on storage.objects;
drop policy if exists mc_saas_video_select on storage.objects;
create policy mc_saas_video_insert on storage.objects for insert to authenticated with check (bucket_id = 'mc-saas-videos' and exists (select 1 from public.mc_saas_members m where m.business_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
create policy mc_saas_video_update on storage.objects for update to authenticated using (bucket_id = 'mc-saas-videos' and exists (select 1 from public.mc_saas_members m where m.business_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role in ('owner','admin'))) with check (bucket_id = 'mc-saas-videos' and exists (select 1 from public.mc_saas_members m where m.business_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
create policy mc_saas_video_delete on storage.objects for delete to authenticated using (bucket_id = 'mc-saas-videos' and exists (select 1 from public.mc_saas_members m where m.business_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
create policy mc_saas_video_select on storage.objects for select to authenticated using (bucket_id = 'mc-saas-videos' and exists (select 1 from public.mc_saas_members m where m.business_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
