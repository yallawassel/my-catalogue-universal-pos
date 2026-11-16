# Live POS connector (v8)

```
 POS PC (AntiSoft / SQL Server)         Supabase (My Catalogue)                 Your store
 ┌──────────────────────────┐  HTTPS  ┌──────────────────────────────┐       ┌──────────────┐
 │ pos-agent (PowerShell)   │ ──────► │ Edge Function mc-pos-connector│ ────► │ index.html   │
 │ read-only SQL login      │  key    │  • checks hashed key          │       │ prices/items │
 │ or CSV export folder     │         │  • matches & previews         │       └──────────────┘
 └──────────────────────────┘         │  • logs sync jobs             │
         ▲ never written to            └──────────────────────────────┘
```

## Components
| File | Role |
|---|---|
| `POS_CONNECTOR_V8_MIGRATION.sql` | `mc_saas_pos_agent_keys` table + `create_key`, `revoke_key`, service-only stock RPC |
| `supabase/functions/mc-pos-connector/index.ts` | The endpoint (`verify_jwt = false`; authenticated by `x-connector-key`) |
| `pos-agent/` | Windows agent, AntiSoft query template, read-only login script, launchers |
| Admin → **Live POS connector** | Create/revoke keys, download `config.json`, test, sync history |

## API
`POST https://<project>.supabase.co/functions/v1/mc-pos-connector`
Headers: `Content-Type: application/json`, `apikey: <publishable key>`, `x-connector-key: mcpos_…`

- `{"action":"ping"}` → business name and key permission.
- `{"action":"sync","dry_run":true,"sync_mode":"full|price","markup_pct":0,"include_stock":false,"items":[…]}`

Item fields: `barcode`, `pos_product_id`, `sku`, `name`, `category`, `description`, `unit1`, `price1`,
`unit2`, `price2`, `stock_qty`, `active`. Max 5,000 items per request. `dry_run` defaults to **true**.

Response: `summary` (received / updated / added / unchanged / skipped / stock_updates / errors) and
`rows` with one action per item: `update`, `new`, `unchanged`, `skip` (+ `reason`).

## Matching & safety rules
1. Unit barcode (multi-barcode packaging) → product barcode → POS product ID → SKU. **Never by name.**
2. Duplicate identifiers in the catalogue → row skipped with a reason (never guessed).
3. Matched products: only prices change (+ missing barcode/SKU/POS ID filled in full mode).
   Names, photos, descriptions and categories you edited are **kept**.
4. New products only in `full` mode and only with a name; never duplicated within one batch.
5. Products are never deleted; nothing is ever written to the POS.
6. Key permissions: `price` (prices only) · `full` (products + prices) · `full_stock` (+ stock).
7. Stock only for units whose conversion is verified (Stock & units page); requires the hybrid stock migration.
8. Every applied run is recorded in `mc_saas_sync_jobs` / `mc_saas_sync_changes` (visible in Admin).

## Agent safety
- Refuses SQL containing INSERT/UPDATE/DELETE/MERGE/EXEC/DROP/ALTER/CREATE/TRUNCATE/INTO/xp_/sp_.
- Must start with SELECT/WITH; runs with `READ UNCOMMITTED` so the POS is never blocked.
- Use the dedicated `mc_readonly` SQL login from `pos-agent/sql/create-readonly-login.sql` — never `dbo`/`sa`.
- Scheduled runs only apply changes when `"autoApply": true`; otherwise they dry-run and log.
- Single-instance lock, unchanged-data skip, 30-day logs, CSV files moved to `processed\` after success.
