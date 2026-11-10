# Unit conversions — manual + Excel (staging)

The Stock Management page supports both methods:

1. **Manual:** choose a product, edit each unit's conversion, barcode and selling price, then save that unit.
2. **Excel/CSV:** export the current unit list or download a conversion template, fill verified values, upload it, review the preview, and explicitly confirm the import.

## Excel columns

- `Unit ID` and `Product ID`: required identity keys. Keep both unchanged. Import matches by these IDs only; it never matches by product name.
- `Conversion to Base`: number of base units contained in one unit. Example: if Piece is the base unit and one Box contains 12 Pieces, enter `12` for Box.
- `Conversion Configured`: set TRUE only after verifying the conversion. Leave FALSE for unknown conversions; the row remains unavailable for cross-unit stock calculations.
- `Barcode`: optional barcode for that exact unit. Box and packet barcodes are separate identifiers.
- `Selling Price`: optional selling price for that unit. Blank clears the unit price.

Base units are fixed at conversion factor 1 and configured TRUE. The import updates existing units only; it does not create or delete products or units, set physical stock, create reservations, or enable reservations. The existing product-level first/second selling prices are kept in sync where the imported unit corresponds to the product's legacy Label1/Label2 fields.

## Safety

- Do not guess pack sizes or conversion factors.
- Keep unknown conversions unconfigured.
- Import is previewed before confirmation.
- No AntiSoft connection is included or activated by this feature.
- Use the My Catalogue staging Supabase project only. Do not run these actions against White Pack's live catalogue or AntiSoft.
