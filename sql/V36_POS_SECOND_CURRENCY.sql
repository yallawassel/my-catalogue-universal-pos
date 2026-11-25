-- v36: POS second currency (LBP, IQD, EGP, SAR...) or none. Existing shops keep LBP.
alter table public.mc_saas_pos_settings add column if not exists second_currency text default 'LBP';
alter table public.mc_saas_pos_settings alter column round_lbp type numeric using round_lbp::numeric;
