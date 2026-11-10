# My Catalogue v6 — Optional product units

## Behaviour

- Every product has one required base unit.
- A second selling/package unit is optional. Leave `Label2` blank for products that are sold in only one unit.
- A later second or additional unit can be added from Admin → Stock Management → Add another selling unit, or by importing a product spreadsheet that includes a non-empty `Label2` value.
- The new unit's conversion factor is optional. If the factor is unknown, leave it blank and keep **I have verified this conversion** unchecked. The unit remains unconfigured and must not be used for cross-unit stock calculations.
- A verified conversion requires a positive factor. Example: if Piece is the base unit and one Box contains 12 Pieces, the Box factor is 12.
- Additional units can be deactivated/reactivated. Deactivation preserves the database row and does not delete its history.
- Clearing an existing product's `Label2` in the product editor or an import file with an explicit `Label2` column deactivates the matching legacy second-unit record; it does not delete it. If an import file has no `Label2` column at all, the existing second unit is preserved.

## Excel workflows

1. **Product import/export:** `Label1` is required; `Label2` is optional. A blank `Label2` means the product has no second selling unit. Add a value later to create/enable a second unit.
2. **Unit conversion workbook:** export existing units, fill only verified factors, preview, then explicitly apply. This workbook updates existing unit rows only; it does not create units. Use the product import workbook to add a new unit through `Label2`, or add it manually in Stock Management.

## Safety boundaries

- No SQL migration is required for this admin/UI enhancement; it uses the existing `mc_saas_product_units.is_active` and `conversion_configured` columns.
- No stock quantities are initialized or changed.
- Online reservations remain disabled unless separately enabled by an authorized user.
- No AntiSoft connector is activated, and no AntiSoft database is accessed.
- Use the My Catalogue staging Supabase project only. Do not use White Pack's live catalogue project.
- Existing unit records are not automatically deleted or rewritten. Review and deactivate a generic/unused second unit only when you are sure it is not needed.
