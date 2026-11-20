-- My Catalogue v9 — Phase B: hide private business fields from the public.
-- Run ONLY after the v9 website files are live (they ask for public columns only).
-- Visitors can still read: name, link, description, WhatsApp, currency, logo, colour, template.
-- Hidden from visitors: owner id, billing plan, payment status, payment notes, expiry date.
begin;
revoke select on public.mc_saas_businesses from anon;
grant select (id, company_name, slug, description, whatsapp, currency, logo_url, primary_color,
              catalogue_template, is_published, created_at, updated_at)
  on public.mc_saas_businesses to anon;
commit;
