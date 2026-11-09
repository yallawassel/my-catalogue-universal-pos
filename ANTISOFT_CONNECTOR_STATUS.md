# AntiSoft connector — implementation status and safety requirements

## Status

The AntiSoft connector is **not implemented or connected** in this staging build. The current release supports spreadsheet-based POS imports. This document records the required design before a local Windows connector is developed.

## Intended one-way architecture

1. A local Windows service runs on the business PC.
2. It connects only to the local SQL Server instance using a dedicated SQL login with `SELECT` permissions on specifically approved views/tables.
3. It reads an explicitly selected product list and the required product/unit identifiers.
4. It produces a local preview and audit log.
5. Only approved records are sent to that business's My Catalogue Supabase project over HTTPS.
6. There is no write-back path from My Catalogue to AntiSoft.

The connector must not use the normal AntiSoft `dbo` account. The inspected environment showed that the current `dbo` session can read, update and delete product records. A dedicated least-privilege account and a permission test are prerequisites. Do not store credentials in HTML, JavaScript, Excel files, or a public repository.

## AntiSoft mapping still required

The inspected database is SQL Server 2008 R2 and the active database is named `Data2025`. Product and unit information is spread across product and unit tables, including `ItemFile` and `ItemUnitFile`.

Before automatic sync is enabled, verify:

- Stable product ID and product name.
- Every unit/package ID associated with a product.
- Barcode values at the unit/package level.
- Unit labels and conversion factors.
- Which prices correspond to which units.
- Whether a product is active/available for online sale.
- How stock quantities are represented and whether they are safe to publish.

A product may have multiple packaging barcodes. The current catalogue import schema stores one primary barcode per product and two price/unit labels. A separate product-unit barcode mapping is required before mapping multiple AntiSoft unit barcodes to one catalogue product. Never create duplicate catalogue products just because one AntiSoft product has multiple unit barcodes.

## Product selection

- Default eligibility: products/units with a valid barcode.
- The business owner can manually include or exclude products.
- No product is published until the owner approves the selection.
- Product names are not used for matching.
- Existing catalogue display names, photos and client-facing content remain intact for matched products.
- Duplicate or ambiguous barcodes require manual resolution.

## Non-negotiable protections

- No `INSERT`, `UPDATE`, `DELETE`, DDL, stored procedure execution, or other write access against AntiSoft.
- No inbound internet access to SQL Server.
- No direct browser-to-SQL Server connection.
- No sync process should block or interrupt normal AntiSoft use.
- If extraction, validation, network transfer, or Supabase write fails, log the error and stop; do not attempt to modify AntiSoft.
- Backups must be independent copies and must never overwrite the live database.
- Test against a restored copy or sample export before connecting to the live database.

## Release gate

Do not enable the AntiSoft connector until:
1. Product/unit/barcode relationships are verified from read-only exports.
2. The least-privilege SQL account is created and tested.
3. The multi-barcode-per-product mapping is implemented and tested.
4. Product selection and preview are verified.
5. One-way network behavior is tested.
6. Recovery and audit logging are tested.
