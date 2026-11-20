# My Catalogue — v9 health check & hardening report (20 Nov 2026)

What was checked: the live Supabase project (`mkodburhxdrvfacytovb`: tables, row-level security, grants,
functions, storage, Supabase security & performance advisors) and every page of the website code.

Legend: ✅ fixed in the database (already live) · 🔧 fixed in code (live after merging the v9 pull request) ·
👤 needs you · 💡 recommendation

## Critical / high
| # | Weak point | Status |
|---|---|---|
| 1 | **Anyone could create fake orders with any price or status.** The shopper's browser sent prices, totals and "paid / delivered" status, and the database trusted them. | ✅ A server trigger now rebuilds every order from the real product prices, forces *new / unpaid*, validates quantities (1–100,000) and rejects unknown or inactive products. Tested: a 0.03 "paid / delivered" fake order became 15.00 "new / unpaid". |
| 2 | **No protection against order spam.** | ✅ Max 5 orders per phone per 10 minutes and 30 orders per minute per store. |
| 3 | **Private billing data was public.** Visitors could read each published store's payment notes, payment status, plan, expiry date and owner id. | 🔧 Pages now request public fields only. Then run `sql/V9_PHASE_B_PRIVATE_BUSINESS_COLUMNS.sql` (after merge) to lock them. |
| 4 | **Big catalogues were silently cut at 1,000 products** (store, admin, quotations) because Supabase returns max 1,000 rows per request. | 🔧 Products now load page by page (up to 100,000). |
| 5 | Visitor role still held insert/update/delete/truncate rights on all tables (only RLS stood in the way). | ✅ Removed — visitors can only read the public catalogue and create orders. |

## Medium
| # | Weak point | Status |
|---|---|---|
| 6 | 18 sensitive functions (AI credits, POS keys, billing, stock) were callable by visitors. They checked permissions inside, but should not be exposed. | ✅ Visitor access revoked; service-only functions limited to the server. |
| 7 | Sync history (audit log) could be edited or deleted by staff. | ✅ Now append-only. |
| 8 | 8 security rules re-checked the user on every row; 10 missing indexes. | ✅ Optimized (faster admin & orders as data grows). |
| 9 | Backup tables from 13 Nov (739 products, 1,041 units…) sat in the public API schema. | ✅ Moved to a private `mc_backup` schema — data kept, not reachable from the internet. |
| 10 | When the server refused an order, WhatsApp still opened with wrong items. | 🔧 Clear message instead (e.g. "product no longer available — refresh"). |
| 11 | Link previews of a store (WhatsApp/Facebook) showed generic text. | 🔧 Store name, description and logo set in page meta tags. |
| 12 | Quotation page showed a unit label without HTML escaping. | 🔧 Escaped. |

## Low / housekeeping
| # | Item | Status |
|---|---|---|
| 13 | 40+ notes and SQL files in the website root. | 🔧 Moved to `docs/` and `sql/`. |
| 14 | Leaked-password protection is off. | 👤 Supabase → Authentication → Password security → enable "Leaked password protection" (may need a paid plan). |
| 15 | Old tables from an earlier catalogue version (`businesses`, `products`, `catalogue_products`, `catalogue_settings`, `business_orders`, …) and the `product-images` bucket still exist. | 💡 Not touched — they may still serve an older site. Delete once you confirm nothing uses them. |
| 16 | `admin.html` is one 150 KB file with one huge script. | 💡 Works, but future features are easier if it is split into modules. Recommended for a later version. |

## Already done earlier (v8 / smart photos — included in this release)
Double sign-in loading, hidden "Open full editor", photo file type, SKU search, weak passwords, lost cart,
JSON backup losing SKU/POS ID, Arabic names never matching photos, photo-match status overwritten.

## After merging
1. Hard-refresh admin and store (cache name `my-catalogue-pro-v9`).
2. Ask Claude (or run in SQL editor) `sql/V9_PHASE_B_PRIVATE_BUSINESS_COLUMNS.sql`.
3. Place a test order from the store and check it in Orders.
