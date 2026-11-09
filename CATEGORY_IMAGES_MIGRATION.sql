-- Run once in Supabase SQL Editor to enable dedicated category artwork.
-- Existing category records are preserved; image_url starts empty until uploaded in Admin.
alter table public.mc_saas_categories
  add column if not exists image_url text not null default '';

-- Ensure the authenticated catalogue manager can maintain category rows.
-- The existing mc_saas_categories_manage policy from SAAS_MIGRATION.sql is reused.
