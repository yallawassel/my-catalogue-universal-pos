-- OPERATOR-ONLY SQL GUIDE. Run in the intended My Catalogue Supabase project.
-- Never put the Supabase service-role key in browser files.

-- 1) Register the platform administrator. Replace with the exact email used
--    to sign in to platform-admin.html. Run this once as the database owner.
-- insert into public.mc_saas_platform_admins(email)
-- values (lower('YOUR-ADMIN-EMAIL@example.com'))
-- on conflict (email) do nothing;

-- 2) Review businesses awaiting approval (SQL Editor/operator only).
-- select id, company_name, slug, owner_id, is_published,
--        subscription_plan, payment_status, subscription_expires_at, created_at
-- from public.mc_saas_businesses order by created_at desc;

-- 3) Platform admin UI now publishes/pauses businesses and edits billing through
--    allowlist-protected RPCs. Do not grant customers access to this SQL guide.

-- 4) Review custom-domain requests and their verification tokens.
-- select d.id, d.domain, d.verification_token, d.verified, d.active,
--        b.company_name, b.slug
-- from public.mc_saas_custom_domains d
-- join public.mc_saas_businesses b on b.id=d.business_id
-- order by d.created_at desc;

-- 5) After independently checking DNS TXT and confirming the domain is attached
--    to the production host with HTTPS, activate that exact domain.
-- update public.mc_saas_custom_domains set verified=true, active=true
-- where domain='shop.example.com';

-- 6) Assign an existing authenticated user as a driver. Replace UUIDs after
--    checking Supabase Auth > Users and the business record.
-- insert into public.mc_saas_members(business_id,user_id,role)
-- values ('BUSINESS_UUID','AUTH_USER_UUID','driver')
-- on conflict (business_id,user_id) do update set role='driver';

-- 7) Revoke a member.
-- delete from public.mc_saas_members
-- where business_id='BUSINESS_UUID' and user_id='AUTH_USER_UUID';
