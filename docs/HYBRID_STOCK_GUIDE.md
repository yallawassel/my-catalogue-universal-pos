# Universal POS — Hybrid Stock Management (Staging)

## Scope and safety

This upgrade is designed for the existing **My Catalogue** Supabase project used by the Universal POS repository. It must **not** be run in the separate White Pack live-store Supabase project. It does not connect to AntiSoft and does not write to any external POS database.

The migration is additive. It creates new `mc_saas_*` stock/unit tables and functions. It does not delete or rewrite existing product rows, product names, images, categories, prices, orders, or customer data.

Take a Supabase backup before running it. The migration has not been executed against your live Supabase project by this package; review the SQL and test it in the intended project first.

## Stock model

- Physical stock is stored in the product's base unit.
- Each additional sellable unit has a conversion factor: `1 unit = N base units`.
- Available stock is `physical stock - active reservations`.
- POS is the authority for physical stock; My Catalogue holds online reservations.
- Customer-facing stock should show availability only, not internal physical quantities. The public `index.html` stock badge is not yet connected in this staging release; this release adds the database and admin setup layer first.
- Internal costs are not stored in or exposed by these stock tables.

Example: if the base unit is Roll and one Box contains 12 Rolls, the Box conversion factor is 12. Selling one Box reserves 12 Rolls.

## Important conversion behavior

The migration seeds each existing product's `label1` as its base unit with factor 1. It seeds a distinct `label2` as a secondary unit but leaves `conversion_configured=false`. The current CSV product matching still works at product level using the legacy main barcode; unit-level barcodes are stored in the new schema/Admin screen, but unit-aware spreadsheet matching is a later enhancement. This is intentional: the system must not guess how many packets, rolls, or pieces are in a box. Set and verify each secondary conversion factor in Admin → Stock Management before enabling reservations for that unit.

Existing product barcode values, when present, are assigned to the seeded base unit. The migration checks for duplicate product barcodes before seeding. Additional unit barcodes are stored separately and must be unique within a business.

## Install order

1. Confirm the Supabase dashboard is the **My Catalogue** project, not White Pack.
2. Take a backup.
3. Open SQL Editor and run `HYBRID_STOCK_MIGRATION.sql` as one script.
4. If the migration reports an error, stop and send the exact error. Do not run partial fragments or retry blindly.
5. Deploy the files from this repository together, including the updated `admin.html` and `HYBRID_STOCK_MIGRATION.sql`.
6. Sign in to the business admin and open **Stock Management**.
7. For each product, verify the base unit and enter correct conversion factors for additional units. Add unit barcodes where available.
8. Set an opening stock count in the base unit once, or use Admin → Stock Management → Apply a POS stock snapshot (staging test) with an authoritative current count and a unique event ID.
9. Keep automatic reservations disabled while configuring. Enable them only after stock and conversion data have been reviewed.
10. Test with one test product and a test order before using real customer orders.

## Existing orders

The migration does not backfill reservations for historical orders. New orders receive reservation rows with `pending` status until the business enables reservations and the product unit and physical stock are configured. When an order is cancelled, its pending/exception/reserved reservation rows are released. Insufficient-stock exception rows count as held quantities so later orders cannot compound an over-commitment. A delivered order remains reserved until the POS sale is explicitly reconciled.

Use Admin → Stock Management → Retry a pending order reservation after correcting stock/unit configuration. The order UUID is available from the Orders dashboard/database.

## POS functions

- `mc_saas_set_opening_stock`: sets the initial base-unit stock once per product. It cannot overwrite an already initialized balance.
- `mc_saas_apply_pos_stock_snapshot`: applies an idempotent physical stock snapshot in a selected unit. It requires a unique external event ID and a configured conversion. Reusing an event ID is ignored.
- `mc_saas_reconcile_order_sale`: releases an online reservation after the POS confirms the sale is already represented in physical POS stock. It does **not** deduct physical stock again.
- `mc_saas_reserve_order`: retries reservation for a particular order after stock setup.

These functions are currently exposed to authenticated business managers for staging/testing. A production AntiSoft/local connector must be implemented separately, use a dedicated read-only AntiSoft SQL account, send approved data one-way over HTTPS, and use a secure server-side relay for authenticated stock RPCs. Do not put database passwords or Supabase service-role keys in browser code or a public repository.

## Status and limitations

- Spreadsheet product/price import remains available from the existing Product & Price Synchronization page.
- Product unit/barcode and stock setup UI is added to Admin.
- The public catalogue does not yet display stock badges; the public availability endpoint/UI is a separate next integration step.
- The spreadsheet importer continues to match the legacy product-level barcode; unit-level barcode matching is not yet wired into the importer.
- This package does not implement an automatic AntiSoft connection, scheduled POS polling, or a live POS API connection.
- The current order trigger creates pending/reserved line records for new orders; it does not retroactively reserve old orders.
- A delivered order is not automatically reconciled. The POS connector must supply a unique sale event and call the reconciliation function only after the POS confirms the sale is reflected in its physical stock.
- If an order unit does not match a configured product unit, the line is flagged as an exception rather than matched by product name.
- Reservation enforcement is disabled by default for every business.

## Verification queries

```sql
select count(*) as unit_rows from public.mc_saas_product_units;
select count(*) as stock_rows from public.mc_saas_product_stock;
select * from public.mc_saas_stock_settings order by business_id;
select * from public.mc_saas_stock_availability limit 20;
select status, count(*) from public.mc_saas_stock_reservations group by status;
```

Do not interpret `stock_initialized=false` as zero stock. It means the physical quantity is not yet known.
