# My Catalogue staging deployment and acceptance checklist

## Before deployment
- [ ] Back up the intended My Catalogue Supabase project.
- [ ] Run `SAAS_MIGRATION.sql`.
- [ ] Run `POS_SYNC_MIGRATION.sql`.
- [ ] Run `SAAS_HARDENING_MIGRATION.sql`.
- [ ] Insert the platform owner's exact sign-in email into `mc_saas_platform_admins` using `PLATFORM_ADMIN_GUIDE.sql`.
- [ ] Confirm Supabase Auth Site URL and Redirect URLs match the HTTPS staging URL.
- [ ] Confirm Google/Microsoft OAuth providers are configured if those buttons will be used.
- [ ] Deploy all files together; preserve lowercase filenames.

## Acceptance tests
- [ ] Register a new customer account and create a business.
- [ ] Confirm the new business is unpublished and its public catalogue is not visible.
- [ ] Sign in to `platform-admin.html` as the allowlisted platform owner; confirm business list loads.
- [ ] Sign in as a normal customer to `platform-admin.html`; confirm access is denied.
- [ ] Approve/publish the test business; open `index.html?shop=your-slug` in a private browser.
- [ ] Save business name, description, WhatsApp number, currency, logo and brand colour.
- [ ] Save each catalogue design and verify the selected design persists after refresh.
- [ ] Create, edit, reorder and delete a test product; test both price units and image upload.
- [ ] Import a small POS spreadsheet in price-only mode; verify matched prices change and blank price cells remain unchanged.
- [ ] Import a small spreadsheet in full-sync mode; verify product identifiers, prices, and audit history.
- [ ] Place a test customer order; verify it appears only in the correct business order dashboard.
- [ ] Create and print a quotation; verify it is stored only in the correct business.
- [ ] Test driver login/location sharing only with an assigned driver account.
- [ ] Test two separate customer accounts and verify no cross-business product/order/quotation access.
- [ ] Verify the admin PWA install starts at lowercase `admin.html` and refreshes the v2 service-worker cache.
- [ ] Test on Android Chrome and desktop Chrome using HTTPS.

## Important test boundary
Static checks can validate files and JavaScript syntax, but live Supabase behavior, authentication, RLS, Storage, OAuth, and deployment must be tested in the connected staging project. Do not treat this checklist as passed until each item is tested there.
