# Universal POS — Product Management v4

## Included in this staging update
- First-product onboarding card for new businesses, with manual entry, spreadsheet import, and a dismiss option.
- SKU is optional for manual product creation and bulk imports. If supplied, duplicate SKUs are still blocked.
- Category defaults to `Products` when omitted in the manual form.
- A dedicated simple Excel product template with Products, Instructions and Example sheets.
- A companion `product-import-template.csv` header template.
- Existing POS synchronization matching remains barcode first, POS Product ID second, SKU third. Names are not automatic matching keys.
- For an empty catalogue, named rows are selected for review by default. For a catalogue that already contains products, barcode rows remain the default selection to preserve safer sync behavior.

## Important limits
- This update does not yet add unlimited units directly to the basic product form. The current form supports the existing two unit/price fields; additional units, unit-level barcodes and conversion factors are configured in Stock Management after the Hybrid Stock SQL migration is installed.
- The simple template intentionally does not import stock quantities. Configure opening/POS stock only after the correct base unit and conversion factors are verified.
- This is a staging build. It has not been deployed or tested against the live Supabase project.


This v4 update is UI and import workflow only. It does not execute SQL or activate reservations.
