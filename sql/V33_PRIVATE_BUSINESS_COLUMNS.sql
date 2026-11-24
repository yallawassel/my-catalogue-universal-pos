-- v33: billing/subscription fields and owner id are not readable through the API by other signed-in users.
-- The platform owner reads them with mc_saas_platform_list_businesses (security definer).
revoke select (owner_id, payment_status, subscription_plan, subscription_expires_at, payment_note) on public.mc_saas_businesses from authenticated;
