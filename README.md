# My Catalogue — Multi-business SaaS starter

This package turns the White Pack feature set into a separate multi-business catalogue platform. It uses the **My Catalogue Supabase project** (`mkodburhxdrvfacytovb.supabase.co`) and does not use or alter the White Pack Supabase project.

## Included

- `admin.html` — account registration/sign-in, create a business profile, logo/brand settings, product CRUD, category, description/specifications, barcode/SKU, two price units, optimized WebP photo uploads, JSON import/export, custom-domain requests.
- `index.html` — public branded catalogue, categories, product search, image zoom, multiple unit prices, cart, customer/delivery form, optional GPS location, database order creation and WhatsApp checkout.
- `orders.html` — business-scoped order dashboard, search, status/payment updates, delivery map link, 10-second refresh.
- `quotation.html` — product picker, client-specific prices/quantities, discount/fee, print-to-PDF, private cloud quotation archive and JSON backup.
- `driver-tracking.html` — staff/driver login, opt-in GPS sharing and location map links.
- `saas.js` — shared Supabase client, domain/slug resolver, image optimizer.
- `SAAS_MIGRATION.sql` — isolated `mc_saas_*` schema and RLS policies.
- `POS_SYNC_MIGRATION.sql` — additive POS identifiers, synchronization jobs and audit history.
- `POS_SYNC_GUIDE.md` — universal POS file-import behavior, barcode-first matching, and connector roadmap.
- `ANTISOFT_CONNECTOR_STATUS.md` — AntiSoft connector requirements and strict one-way/read-only safety gates.
- `SAAS_HARDENING_MIGRATION.sql` — completes missing settings/template/platform RPCs, adds subscription fields, and protects platform-only fields with an email allowlist.
- `PLATFORM_ADMIN_GUIDE.sql` — platform administrator allowlist, domain approval and driver assignment instructions.

## Important: do not overwrite White Pack

Keep these files in a **new repository** such as `my-catalogue-saas`. They are not drop-in replacements for White Pack. The new platform uses its own tables (`mc_saas_*`) and image bucket (`mc-saas-images`). Existing White Pack orders, products and accounts remain separate.

## Setup order

1. Back up the intended My Catalogue Supabase project.
2. Open Supabase → SQL Editor and run these files in order: `SAAS_MIGRATION.sql`, `POS_SYNC_MIGRATION.sql`, then `SAAS_HARDENING_MIGRATION.sql`. Do not run them in the White Pack Supabase project. The migrations are additive; back up the database first.
3. In Supabase SQL Editor, open `PLATFORM_ADMIN_GUIDE.sql`, replace the example email with the platform owner's exact sign-in email, and run the allowlist INSERT statement. Do not skip this step: platform-admin.html must deny all other accounts.
4. In Supabase → Authentication, configure Site URL and Redirect URLs for the deployed app. Keep email confirmation enabled for production.
5. Upload the HTML files and `saas.js` together to a new repository/deployment. All files must share the same directory so relative links work. Use the exact lowercase filenames in this ZIP.
6. Open `admin.html`, create an account, confirm the email if requested, sign in, and create a business profile.
7. Open `platform-admin.html` using the allowlisted platform-owner account. Review the business, approve/publish it, and set its subscription/payment details.
8. Add products and photos. Test the catalogue URL in an incognito/private browser and place a test order.
9. Test cross-business isolation with two separate accounts: verify each account only sees its own products, orders, quotations and domains.

## Custom domains — hosting requirement

The public page resolves a verified custom domain from `mc_saas_custom_domains`, or a platform-hosted slug URL such as `index.html?shop=cedar-bakery`. A custom domain is not activated just because it is entered in the admin. The platform operator must validate DNS and activate the domain row.

**Standard GitHub Pages is not suitable for serving many independent customer custom domains from one project.** Use a hosting setup that supports multiple custom domains on one deployment (for example Cloudflare Pages with custom domains configured for that project, or an equivalent edge/proxy setup). Configure the domain's DNS and HTTPS at the hosting provider first. Then review the requested domain and token and mark it verified/active using the operator-only SQL example. Do not mark a domain verified merely because a customer entered it.

The `verification_token` is generated for a future DNS TXT verification workflow; this starter does not automatically query DNS or configure custom domains at the hosting provider. Domain verification/hosting hookup is a manual platform-operator step in this version.

## Manual business approval

New businesses are created unpublished (`is_published=false`). A platform operator reviews each business, then publishes it from `platform-admin.html`. The hardening migration installs an email allowlist for platform administrators. A database trigger blocks business owners from changing publication status, owner ID, catalogue slug, or subscription/payment fields through the browser API. Platform RPCs verify the allowlist on every call.

## Security notes

- Browser code contains only the Supabase publishable key. Never place a `service_role`/secret key in any HTML, JS, JSON, or public repository.
- RLS policies scope all product, order, quotation, domain, and image writes to the authenticated business membership.
- Public visitors can read active products only for published businesses and can insert an order only for a published business. They cannot read private orders or quotations.
- Customer order insertion is intentionally anonymous, so production deployments should add rate limiting / bot protection (for example a Cloudflare Turnstile + server-side verification flow) before marketing the platform broadly.
- Driver accounts need to be assigned the `driver` role by a trusted operator. The UI does not grant staff access to itself.
- Supabase Storage image objects are public-read because product photos must display in the public catalogue. Upload/update/delete is restricted to authenticated business members by business-ID folder.
- SQL Editor actions are privileged. Treat `PLATFORM_ADMIN_GUIDE.sql` as an operator-only guide.

## POS connector status

The current build supports Excel/CSV imports and per-row approval. Barcode is the primary matching key, followed by POS Product ID and SKU. Rows with barcodes are preselected for review; users can manually select other rows. Existing catalogue display names are retained when an imported row matches.

The AntiSoft Windows connector and connectors for external POS APIs are roadmap items, not active connections. The AntiSoft connector must use a dedicated read-only SQL account and must handle multiple unit barcodes per product before release. See `ANTISOFT_CONNECTOR_STATUS.md`.

## Current limitations to finish before commercial launch

- Domain verification and hosting-provider custom-domain attachment are manual, not automated.
- Billing/subscription collection is not included; plan/payment status and expiry are tracked manually by the platform administrator.
- Team member invitation/role management and automated password-recovery UX need further polish.
- This package is a functional starter; complete end-to-end tests and RLS review in a staging Supabase project before production use.
