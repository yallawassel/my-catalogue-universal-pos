MY CATALOGUE SAAS — CORRECTED FILE PACKAGE

Corrections in this package:
1. Admin product list now supports editing name, category, barcode/SKU, units, prices, description and display order directly in the product row, with a Save this row button.
2. Product photos can be changed directly from each row; uploaded images are optimized and saved to the business image bucket.
3. Public catalogue category and product photos use square image areas with object-fit: contain so the full product is visible instead of being cropped.
4. JSON and spreadsheet import workflows skip products that match an existing normalized name or barcode/SKU, and skip repeated rows in an import, to prevent creating more duplicates.
5. Added Review duplicates in the admin Products section. Review the displayed groups carefully and delete only extra records you are certain you do not need. Deleting is permanent.
6. Existing ordering features and business-scoped Supabase data access were retained.

VALIDATION: JavaScript syntax checks passed for the inline scripts in admin.html, index.html, orders.html, driver-tracking.html, platform-admin.html, and saas.js.
LIMITATION: This package was syntax-checked but could not be live-tested against your Supabase project from this environment. After uploading, test with one product before bulk changes.

DEPLOYMENT: Back up the current GitHub files. Replace the matching files in the my-catalogue repository, keeping filenames and folder structure unchanged. Keep White Pack separate.

7. Product synchronization now defaults to Full product sync so new products can be added.
8. SKU is the primary match reference (SKU → POS Product ID → Barcode). New products require a unique SKU.
9. Manual product saving requires a unique SKU. The Supabase migration creates a unique per-business SKU index after checking for existing duplicates.
