# AI Bulk Photography — Phase 2

## Included
- Bulk image generation for all products, products missing a photo, or one category, capped at 1,000 products per prepared queue.
- Estimated credit cost confirmation using the current 10-credit generation rate.
- Durable per-product queue rows, sequential processing through the existing Edge Function, per-item statuses, failure recording and retry.
- Generated images are previewed and require individual approval before updating `mc_saas_products.image`. The original storage object is not deleted.

## Install
1. Keep this update on a staging branch.
2. In the existing My Catalogue Supabase project, run `AI_BULK_PHOTOGRAPHY_MIGRATION.sql` once.
3. Upload the updated `admin.html` and migration to staging.
4. No changes to the existing Edge Function, OpenAI secrets, wallet migration, SaaS schema, orders or POS setup are required.
5. Refresh Admin and open AI Studio → AI Bulk Photography.

## Important limitations
- This first release processes one image at a time in the open admin page. Closing the page stops active processing. Queued rows remain in Supabase and can be resumed after reopening. An item interrupted while marked `processing` must be inspected before retrying to avoid duplicate charges.
- 1,000 images can require up to 10,000 internal credits and substantial API spend. The UI displays the estimate and asks for confirmation.
- Failed provider requests are refunded by the existing Edge Function.
- Bulk generation creates new images; bulk editing existing photos is not included in this first bulk release. Single-photo editing remains available.
- Approval is individual. Generated images are never automatically applied to live products.
