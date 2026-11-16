# AI Studio Cost-Safety Update

## What changed
- AI chat remains enabled at 1 internal credit per request.
- Proposed internal prices are 2 credits for new image generation and 3 credits for image editing.
- Image generation and editing are disabled by default in the Edge Function. The guard runs before job creation and before any wallet deduction.
- The Admin photography controls are disabled and clearly marked as paused.
- No SQL migration is included or required for this change.

## Important cost note
The 2/3 values are internal wallet credits, not OpenAI dollars. They are provisional and must not be advertised as final until actual provider usage and billing are measured. This update does not make OpenAI image requests free or lower their provider price.

## Deployment
1. Upload the changed `admin.html` and `supabase/functions/mc-ai-studio/index.ts` to the existing staging branch/repository, preserving all other files.
2. Deploy the updated `mc-ai-studio` Edge Function to the existing Supabase project.
3. Do NOT set `AI_IMAGE_GENERATION_ENABLED` yet. Leave it unset (or set it to `false`).
4. No SQL migration is needed. Do not rerun the existing AI Studio migration.
5. Chat should continue to work and use 1 My Catalogue credit. Image requests should return a paused message without creating a job or deducting credits.

## Future controlled enablement
Only after reviewing actual OpenAI billing/usage, a platform administrator may set the Edge Function secret `AI_IMAGE_GENERATION_ENABLED=true`. Optional internal prices can be set with `AI_IMAGE_GENERATE_CREDITS` (default 2) and `AI_IMAGE_EDIT_CREDITS` (default 3). These are wallet prices only, not provider-cost controls. Keep image generation disabled until the business deliberately chooses to pay the provider cost.

## Verification performed
- Source ZIP extracted successfully.
- Updated files contain the safety gate and UI pause.
- Confirmed the safety gate precedes AI job creation and credit deduction.
- Confirmed no SQL migration was added and no existing migrations were changed.
- ZIP archive integrity checked after packaging.
- No live Supabase deployment or paid OpenAI request was performed.
