# My Catalogue AI Studio — Phase 1 installation

This is an additive upgrade to the existing My Catalogue project. It adds AI Studio without replacing existing catalogue, authentication, orders, quotations, POS, domains, or product tables. The three Petit Bon trial photos are not required by this upgrade.

## Included

- `admin.html`: AI Studio admin page with catalogue chat, new image generation, uploaded-image editing, credit balance, and template selection.
- `AI_STUDIO_MIGRATION.sql`: isolated AI wallet, ledger, job, conversation/message, and plan tables plus credit-control RPCs. Existing businesses receive 15 one-time launch credits; this is not a recurring monthly allowance.
- `supabase/functions/mc-ai-studio/index.ts`: authenticated Edge Function for chat, image generation, and image editing. OpenAI credentials remain server-side. Failed provider requests trigger a credit refund.

## Important deployment rule

The user has confirmed that the old trial product photos are disposable. They do not need to be backed up or migrated for AI Studio. **Do not delete or recreate the Supabase database.** The AI migration is additive and does not delete product, order, quotation, account, or POS records.

A database export is still recommended before any production schema change, but it is not a prerequisite for reviewing or deploying this package to a separate staging repository/project.

## Deployment order

1. Upload this ZIP to a separate staging GitHub repository first. Keep the current production repository unchanged.
2. Confirm the target Supabase project is the existing My Catalogue project, not White Pack and not a newly created project.
3. In Supabase SQL Editor, run `AI_STUDIO_MIGRATION.sql` once. It expects the existing My Catalogue SaaS schema and hardening migration to be installed, including `mc_saas_businesses`, `mc_saas_members`, `mc_saas_can_manage`, and `mc_saas_is_platform_admin`. It does not replace those migrations.
4. Deploy `supabase/functions/mc-ai-studio` as the Edge Function named `mc-ai-studio`.
5. Add Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `OPENAI_TEXT_MODEL` — optional; defaults to `gpt-5.5`
   - `OPENAI_IMAGE_MODEL` — optional; defaults to `gpt-image-2.5-flare`
   - `OPENAI_IMAGE_EDIT_MODEL` — optional; defaults to `gpt-image-2.5-sunburst`
   Supabase supplies its standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` runtime values. Never put the OpenAI key or service-role key in browser code or GitHub.
6. Confirm the existing `mc-saas-images` Storage bucket exists. The current SaaS migration creates it as public-read for catalogue images; Edge Function writes use the service role.
7. Sign in to staging `admin.html`, open AI Studio, and confirm the wallet displays 15 launch credits for an existing business.
8. Test chat (1 credit), image generation (10 credits), and image editing (12 credits). Confirm images save to the business folder in `mc-saas-images`, balances update, and failed provider requests refund credits.
9. Test with two different business accounts. Confirm neither business can read the other's wallet, jobs, or ledger.
10. Only after staging checks pass, deploy the same tested package and migration to production.

## Phase 1 scope and limitations

- AI chat, new product-image generation, editing an uploaded image, and applying the existing eight catalogue templates.
- AI chat suggestions do not directly modify live products. The business owner must review and apply changes manually.
- Generated images are saved in the existing `mc-saas-images` bucket. This phase displays the resulting URL; assigning the image to a product remains a manual action.
- Subscription checkout, recurring monthly credit renewal, paid credit packs, payment-provider webhooks, plan enforcement, and receipts are Phase 2. The plan table is only a plan-definition foundation; it does not collect money or renew subscriptions.
- Existing businesses receive a one-time 15-credit launch balance. Do not advertise monthly AI allowances as active until recurring billing is implemented.
- Image generation requires API billing and may require OpenAI organization verification. Keep spending limits enabled and test with a small budget.

## Phase 1 credit schedule

- Chat: 1 credit
- Generate a new image: 10 credits
- Edit an uploaded image: 12 credits

These are internal credit units, not a promise of a fixed dollar value. Recalculate them against actual API usage before selling credits.
