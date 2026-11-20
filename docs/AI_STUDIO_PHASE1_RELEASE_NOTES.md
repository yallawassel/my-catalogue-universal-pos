# AI Studio Phase 1 — release notes

## Delivered
- Added AI Studio to the business admin navigation and dashboard.
- Added OpenAI-backed catalogue chat via the Responses API.
- Added product image generation and uploaded-image editing via the Images API.
- Added server-side business membership checks, credit consumption, job logging, and failed-request refunds.
- Added isolated AI wallet, ledger, job, conversation, message, and plan tables with row-level security.
- Added a one-time 15-credit launch balance for existing and newly created businesses.
- Added selection/application of the existing eight catalogue templates.

## Verification performed in this build
- All inline JavaScript blocks in `admin.html` passed `node --check`.
- The Edge Function TypeScript transpiled without syntax diagnostics.
- The ZIP archive passed integrity validation.
- OpenAI model identifiers were checked against current official API documentation: `gpt-5.5`, `gpt-image-2.5-flare`, and `gpt-image-2.5-sunburst`.

## Not yet verified
- Live Supabase SQL execution and RLS behavior (requires access to the user's Supabase project).
- Edge Function deployment and real API calls (requires the user's Supabase and OpenAI credentials).
- Payment checkout, recurring subscriptions, monthly credit renewal, and paid credit top-ups (Phase 2).
