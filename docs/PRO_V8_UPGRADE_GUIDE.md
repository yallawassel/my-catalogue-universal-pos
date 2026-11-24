# My Catalogue PRO — v8 upgrade guide

This release upgrades the v7 "Universal POS + AI Studio" package to a professional, colourful,
easier-to-use product. **All v7 features are kept** (products, Excel sync, categories, stock & units,
AI Studio, orders, quotations, driver tracking, platform admin, 8 storefront templates). Database
tables are unchanged except for one small additive migration.

---

## ✨ What's new

| Area | What you get |
|---|---|
| **New design** | Colourful gradient design system (`theme.css`) on every staff page, dark sidebar navigation, page titles, toast notifications, mobile slide-out menu. Storefront polish in `storefront.css` (works with all 8 templates). |
| **Dashboard** | Greeting, KPI cards (products, categories, photo coverage, new orders), launch checklist with progress bar, recently updated products, quick-action tiles. |
| **Sign-in system** | Split-screen sign-in page, Sign in / Create account tabs, show/hide password, password strength meter + confirm password, **magic-link email sign-in**, friendly error messages, Google & Microsoft buttons, sign-out always in the sidebar. |
| **Import & Export Center** | Products → Excel / CSV (UTF-8, Arabic-safe), full JSON backup (settings, products, category order & photos, units), orders → Excel by date range, photo list, printable price list (save as PDF), restore backup, all templates in one place. |
| **Live POS connector** | Connector keys (hashed, revocable), `mc-pos-connector` Edge Function, Windows agent for POS / SQL Server (read-only), CSV export-folder watcher, HTTPS API for cloud POS. Dry-run preview, sync history, optional stock. |
| **Photo Studio (free)** | In-browser auto pro photos: removes plain backgrounds, centres & frames, auto light/colour, soft floor or drop shadow, 6 background styles. Single photo or **bulk** with review before saving. Products without a photo get a **branded photo card**. No AI credits used. |
| **Storefront** | Search now finds products across all categories, cart is saved on the device (survives refresh), cart button shows the total, add-to-cart animation, brand-tinted placeholders, order confirmation message. |

## 🛠️ Weak points fixed

1. **Double loading after sign-in** — two auth listeners both reloaded the business; now one guarded listener.
2. **"Open full editor" did nothing visible** — the editor page was hidden; it now opens the editor.
3. **Inline photo upload** always saved as `.webp` even when the browser produced JPEG — fixed.
4. **Product search** ignored SKU and POS product ID — now included.
5. **Status messages** appeared at the top of a long page and were easy to miss — now toasts.
6. **Sign-out** was hidden inside Business settings — now in the sidebar (and on the create-business screen).
7. **JSON backup/restore** lost SKU, POS ID and active flag — kept now.
8. **Weak passwords** were accepted (8 chars only) — now letters + numbers required, with a strength meter.
9. **Storefront search** only filtered category tiles — now shows matching products directly.
10. **Cart lost on refresh** — now saved per business on the device; prices are re-checked from the live catalogue.
11. **AI Bulk Photography docs** described a UI that was missing from admin — replaced by Photo Studio bulk mode (free) with per-photo approval.
12. **Products list fields had no labels** — every inline field is now labelled; each product has a 📸 *Pro photo* shortcut.

---

## 🚀 Installation (staging first)

> Use the **My Catalogue** Supabase project only — never White Pack. Take a backup first.

1. **Database** — in Supabase SQL Editor run **`POS_CONNECTOR_V8_MIGRATION.sql`** once.
   (Do not re-run older migrations on the existing project.)
2. **Edge Function** — deploy the connector (it uses its own key, not a user login):
   ```bash
   supabase functions deploy mc-pos-connector --no-verify-jwt
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by Supabase.
   The existing `mc-ai-studio` function is unchanged.
3. **Website files** — upload everything to the same folder as before. New files:
   `theme.css`, `storefront.css`, `admin-pro.js`, `photo-studio.js`, plus the `pos-agent/` folder
   (that folder is for the POS PC — it does not need to be on the website).
4. **Supabase Auth** (for the magic link): Authentication → URL Configuration must contain your
   `admin.html` URL in Redirect URLs (same as for password reset). Email provider must be enabled.
5. Hard-refresh the browser (Ctrl+F5). The service worker cache name changed to `my-catalogue-pro-v8`.

## ✅ Test checklist

- [ ] Sign in, sign out, create account (weak password is refused), forgot password, magic link.
- [ ] Dashboard numbers match your products; checklist items open the right pages.
- [ ] Products → *Open full editor* → change a price → *Update product*.
- [ ] Photo Studio → choose a product → *Preview* → *Use this photo*. Then bulk on one category.
- [ ] Import & Export → download Excel, CSV and backup; re-import the Excel in *Excel / CSV sync* (dry review).
- [ ] Live POS connector → create key → *Test connection* → agent `Run-DryRun.cmd` → check `logs\last-dryrun.csv`.
- [ ] Storefront: search finds products, cart survives refresh, order opens WhatsApp.
- [ ] Two separate business accounts still only see their own data.

## ⚠️ Honest limits

- **Photo Studio** removes *plain* backgrounds (wall, table, paper). Busy backgrounds are kept and the
  photo is enhanced and framed instead — the preview tags each result so you can untick it.
- **POS** column names are not documented publicly; `pos-products.sql` has `<<placeholders>>`
  you fill after running `sql/pos-discover-columns.sql`. The agent refuses to run until they are filled.
- The connector, agent and UI were syntax-checked and logic-tested against a simulated database in this
  build, **not** against your live Supabase project or a real POS PC. Run the checklist on staging.
- AI image generation stays paused until the platform owner sets `AI_IMAGE_GENERATION_ENABLED=true`.
- Billing/subscriptions and automatic custom-domain hookup are still manual (unchanged from v7).
