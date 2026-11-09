# My Catalogue — Universal POS synchronization

## Current capability in this staging build

- Excel/CSV file import from different POS systems is available now.
- The Admin includes a **POS Connections** page showing connector availability and safety rules.
- Product import supports **Price-only** and **Full product** modes.
- Rows containing a barcode are selected automatically for review. Rows without a barcode remain available for manual selection.
- Every selected change must be reviewed and explicitly authorized before it is applied.
- Existing product photos are preserved unless a replacement photo is explicitly selected in full-sync mode.
- No product is deleted because it is missing from an uploaded file.
- Each business is scoped to its own My Catalogue Supabase data.

## Product matching order

1. **Barcode** — primary product matching key.
2. POS Product ID — fallback if no barcode match exists.
3. SKU — final fallback.
4. If no identifier matches, the row is treated as a new product in Full product mode only.

If any identifier produces multiple matches, synchronization stops for that row and requires manual review. Product name is never used as an automatic matching key.

**Important:** the current spreadsheet importer still matches at product level using the legacy main barcode field. The new hybrid stock schema stores multiple unit-level barcodes, but the spreadsheet matching flow is not yet unit-aware. Some POS systems, including AntiSoft, may store different barcodes for different packaging units. Before enabling an automatic connector or unit-aware import, map product IDs and unit IDs safely. Do not treat a box barcode and a packet barcode as interchangeable.

## Product names and catalogue content

- When an imported row matches an existing catalogue product, the existing WhitePack/customer-facing product name is retained.
- The POS name is used as the default name only when creating a new catalogue product.
- Existing images are preserved unless a replacement image is explicitly chosen.
- Existing category and description are used as fallbacks when the import leaves those fields blank.
- Price-only mode changes only supplied non-empty price cells and `updated_at`.

## Supported spreadsheet columns

Recognized headings include:

- `POS Product ID`, `POS ID`, `Product ID`, `External ID`
- `Product Name`, `Name`, `Product`, `Item`
- `Barcode`, `EAN`, `UPC`
- `SKU`, `Item SKU` (required for newly created products; used as a fallback match key)
- `Category`
- `Label1`, `Unit1`, `First Unit`; `Price1`, `Price 1`, `Selling Price`, `Wholesale Price`
- `Label2`, `Unit2`, `Second Unit`; `Price2`, `Price 2`, `Retail Price`
- `Description`, `Details`, `Specifications`
- `Photo URL`, `Image URL`, `Display Order`

For reliable barcode matching, format barcode columns as text in Excel so leading zeros are preserved.

## POS connector roadmap

- **Spreadsheet import:** available in this build.
- **AntiSoft Windows connector:** planned. It must run locally, use a dedicated read-only SQL account, read only approved fields, and send selected data one way over HTTPS. It is not active in this build.
- **Other POS connectors:** can be added through vendor APIs, scheduled exports, or separate local agents. Each connector needs its own field mapping and security review.
- Never expose SQL Server to the public internet. Never place database passwords, Supabase service-role keys, or connector secrets in browser code or a public repository.

## Synchronization audit and safety

- Synchronization runs within the signed-in business scope and relies on the existing `mc_saas_can_manage(business_id)` RLS helper.
- Each job and per-product change is recorded in `mc_saas_sync_jobs` and `mc_saas_sync_changes`.
- Ambiguous identifiers are not auto-updated.
- No missing product is automatically deleted.
- This release implements file-based synchronization. No POS API or direct AntiSoft connection is claimed to be active.
- Change history is audit data in this release; automated one-click rollback is a later enhancement.

## Hybrid stock management

See `HYBRID_STOCK_GUIDE.md` and `HYBRID_STOCK_MIGRATION.sql` for the additive hybrid-stock upgrade. The migration adds per-unit barcodes and conversion factors, base-unit physical stock, online reservations, stock movement history, POS unit mappings and idempotent stock-sync events. Reservation enforcement is disabled by default. Do not enable it until each unit conversion and physical stock balance has been checked. This does not activate the AntiSoft connector.

## First-time setup

1. Back up the intended **My Catalogue** Supabase project.
2. Open Supabase → SQL Editor.
3. The existing project already contains the POS sync columns/tables. Do not rerun `POS_SYNC_MIGRATION.sql` unless a schema check proves it is missing.
4. For hybrid stock, review and run `HYBRID_STOCK_MIGRATION.sql` only after taking a backup.
5. Deploy the updated `admin.html` and the other project files together.
6. Sign in as a business owner and open **Product & Price Synchronization**.
7. Download the POS template or upload an Excel/CSV exported from the POS.
8. Review the automatically selected barcode rows. Manually select any additional rows you intend to import.
9. Choose Price-only or Full product mode, review the preview, and authorize the sync.

Do not run these migrations in the WhitePack live-store Supabase project. This My Catalogue project is separate.
