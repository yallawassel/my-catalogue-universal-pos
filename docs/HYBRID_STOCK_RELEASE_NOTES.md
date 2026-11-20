# Universal POS Hybrid Stock — Staging v3

## Included

- Additive SQL migration for seven new stock/unit tables and a staff-only availability view.
- Unit-level barcode support and explicit conversion factors.
- Base-unit physical stock and derived active reservations.
- Stock movement audit records.
- POS unit mapping and idempotent POS stock event tables.
- New-order reservation trigger, cancellation release, order-item-change recalculation, and delivered-order POS reconciliation function.
- Reservation enforcement disabled by default for every business.
- Admin → Stock Management page for unit/barcode setup, conversion verification, one-time opening stock, reservation enable/disable, and retrying a pending reservation.
- Updated migration guide and AntiSoft connector status.

## Safety boundaries

- White Pack's separate Supabase project is not a target of this migration.
- Existing product and order rows are not rewritten or deleted.
- Existing secondary units are seeded as unverified; their conversion factors must be entered by a human.
- Unknown stock is represented as `stock_initialized=false`, not as confirmed zero stock.
- Physical stock and audit ledgers are not directly writable from the browser; trusted SQL functions write them.
- Public catalogue stock badges and unit-aware spreadsheet matching are not wired in this staging release yet.
- No AntiSoft connection is active. No SQL Server credentials or service-role key are included.

## Validation performed on the package

- Admin inline JavaScript passed `node --check`.
- Archive integrity and file presence are checked when the ZIP is built.
- The SQL migration has not been executed against the user's Supabase project. Run it only after backup, in the existing My Catalogue project, and stop if SQL Editor reports an error.
