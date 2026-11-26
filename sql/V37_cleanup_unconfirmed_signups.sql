-- V37: remove e-mail sign-ups that were never confirmed (fake / mistyped addresses).
-- Only users who: signed up with e-mail+password, never confirmed, never signed in, are older than 3 days,
-- and own / belong to nothing. Runs daily.
create or replace function public.mc_saas_cleanup_unconfirmed()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  with gone as (
    delete from auth.users u
    where u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and coalesce(u.raw_app_meta_data->>'provider','email') = 'email'
      and u.created_at < now() - interval '3 days'
      and not exists (select 1 from public.mc_saas_members m where m.user_id = u.id)
      and not exists (select 1 from public.mc_saas_businesses b where b.owner_id = u.id)
      and not exists (select 1 from public.mc_saas_platform_admins a where a.user_id = u.id)
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.mc_saas_cleanup_unconfirmed() from public, anon, authenticated;
select cron.unschedule('raffi-cleanup-unconfirmed') where exists (select 1 from cron.job where jobname = 'raffi-cleanup-unconfirmed');
select cron.schedule('raffi-cleanup-unconfirmed', '23 3 * * *', 'select public.mc_saas_cleanup_unconfirmed()');
