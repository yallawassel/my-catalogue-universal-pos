# My Catalogue Universal POS — v6 release notes

## Optional product units

- Product creation/editing now allows a single base unit without forcing a generic `Packet` second unit.
- Product Excel imports support a blank optional `Label2`; if the column is absent, existing second-unit data is preserved.
- A second/additional unit can be added later from Stock Management or via product import.
- Additional units can be saved with no conversion factor and remain unconfigured until verified.
- The unit editor shows a blank conversion field for unconfigured units instead of displaying a misleading factor of 1.
- Non-base units can be deactivated/reactivated without deleting their records.
- Existing second-unit records are preserved; clearing an explicitly supplied second-unit label deactivates the matching old unit rather than deleting it.

## Unchanged safeguards

- Stock quantities remain uninitialized.
- Reservations remain disabled by default.
- No AntiSoft connection is active.
- No changes to White Pack's live Supabase project.
- No database migration is required for these UI changes.

See `OPTIONAL_PRODUCT_UNITS_V6.md` for detailed behaviour and testing notes.
