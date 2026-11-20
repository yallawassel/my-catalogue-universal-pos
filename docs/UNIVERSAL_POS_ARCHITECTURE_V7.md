# My Catalogue Universal POS — v7 architecture

## Purpose

One synchronization engine with pluggable adapters so a business can use a well-known cloud POS, a locally developed Lebanese POS, or a system with no direct integration.

## Customer onboarding

1. Create a My Catalogue account and business.
2. Open **POS Connections**.
3. Enter the POS product name and answer the compatibility questions.
4. Review the recommended connection method.
5. Save a connection profile. Saving a profile does not connect to the POS or start synchronization.
6. Complete the appropriate adapter setup.
7. Preview product, unit, barcode, price, and stock mappings.
8. Resolve duplicate/ambiguous identifiers.
9. Explicitly authorize a synchronization job.
10. Review the job result and audit history.

## Connector adapter types

- `file`: Excel/CSV export and import. This is the currently available method.
- `api`: vendor API adapter. Requires documented vendor API, scoped credentials, and server-side secret storage.
- `local_agent`: Windows service/agent for an on-premise POS database. It reads locally using a dedicated least-privilege read-only account and sends approved records outbound over HTTPS. No inbound SQL exposure.
- `custom`: vendor-specific or bespoke integration where no standard API/file mapping is sufficient.

The compatibility checker recommends a method from customer-provided answers. It is guidance, not a technical proof that a connector is supported. An adapter must be developed and tested before a profile can be marked ready.

## Shared normalized record contract

Each adapter should emit normalized records with:

- `external_product_id` (POS product ID)
- `external_unit_id` (POS unit/package ID)
- `product_name` (source label; never an automatic matching key)
- `sku`
- `unit_name`
- `barcode` (unit-level where available; preserve as text/leading zeros)
- `conversion_to_base` and `conversion_configured`
- `selling_price` and currency
- `physical_quantity` and quantity unit
- `is_active`
- `source_updated_at` or source version when available

An adapter must identify which source fields are authoritative and must not invent missing values.

## Matching and update rules

1. Match by unit barcode first where a unit barcode exists.
2. Match by POS Product ID plus POS Unit ID as the next stable external identity.
3. Match by SKU only when unique within the business and appropriate to the product/unit mapping.
4. Never auto-match by product name.
5. Stop ambiguous/duplicate matches for manual review.
6. Preserve catalogue display name, image, description, and category for matched products unless the owner explicitly approves a change.
7. Do not auto-delete products absent from an import/sync.
8. Never expose purchase cost to the public catalogue.

## Stock and availability

- Stock tracking is optional per business.
- Hybrid mode uses POS physical stock as source of truth and My Catalogue reservations for online orders.
- Available quantity = physical quantity - active reservations, in the product's base unit.
- Unit conversions must be verified before cross-unit stock calculations.
- Idempotency keys/external event IDs prevent duplicate stock events.
- A POS-confirmed sale reconciles its matching reservation to prevent double deduction.
- Public catalogue shows `In stock` or `Out of stock`, not the remaining numeric quantity.
- Reservations remain disabled until a business has validated units and initialized physical stock.

## Security boundaries

- Never store POS passwords, API tokens, SQL credentials, or Supabase service-role keys in browser code or the connection profile table.
- API secrets belong in a managed server-side secret store.
- Local database credentials stay on the business PC in the local agent's protected configuration and use a dedicated read-only account.
- No direct browser-to-SQL connection and no public internet exposure of a POS database.
- The AntiSoft connector is planned only. It is not connected or active.
- Work only in the My Catalogue staging Supabase project. Never touch White Pack's live project or write to AntiSoft.

## Current implementation status in v7 package

- Excel/CSV import and preview: available in the v6 admin.
- POS compatibility questionnaire and business-scoped connection-profile UI: added in v7 package; requires the additive SQL migration.
- API adapters: not implemented.
- Windows local-agent adapters: not implemented.
- AntiSoft: not connected; dedicated read-only account and field mapping are prerequisites.
- Automatic scheduling: not implemented; saved profiles default to manual.
- Saving a profile does not mark it connected or trigger a sync.
