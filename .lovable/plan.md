
# SanMar / S&S / AS Colour / Otto Cap → Shopify Importer

A team-operated dashboard that pulls products from four apparel/cap suppliers, applies markup rules, pushes them to your connected Shopify store (`sunrisetester.myshopify.com`), and keeps inventory in sync on a schedule.

## What gets built

### 1. Backend (Lovable Cloud)
Tables (with RLS + user_roles for admin/operator):
- `supplier_credentials` — encrypted creds per supplier per user/team (customer #, username, password, account #, API token)
- `markup_rules` — per supplier + optional category/brand override (flat $, %, or tiered)
- `imported_products` — maps supplier SKU/style → Shopify product/variant IDs, last cost, last synced
- `sync_jobs` — history of import & inventory runs (status, counts, errors)
- `import_queue` — products selected/staged before push to Shopify (review queue if you want it later)

### 2. Supplier integrations (server functions)
Each in `src/lib/suppliers/<name>.functions.ts`:
- **SanMar** — SOAP web services (PromoStandards Inventory 2.0.0 + Product Data 2.0.0) using credentials user enters. CSV/FTP fallback path for nightly bulk.
- **S&S Activewear** — REST API (`api.ssactivewear.com`) Basic auth (Account # + API key). Endpoints: `/products`, `/styles`, `/inventory`.
- **AS Colour** — Shopify-style wholesale feed / CSV (AS Colour does not publish a public dealer REST; we'll use their dealer CSV/JSON feed URL the user supplies).
- **Otto Cap** — Dealer REST/CSV feed (Otto provides authenticated CSV inventory + product feeds).

Each supplier module exposes the same shape: `searchProducts`, `getProduct(styleId)`, `getInventory(styleIds[])`, `listAllForSync()`.

### 3. Shopify Admin API
Server-only module `src/lib/shopify/admin.server.ts`:
- Uses the Admin token already wired by the Shopify connector (`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_STORE_PERMANENT_DOMAIN`)
- `createProduct` (with variants per size/color, images, vendor, tags, cost-per-item)
- `updateVariantInventory` via Inventory Levels API (single location to start)
- `updateVariantPrice` when markup rules change

### 4. Scheduled inventory sync
Public TSS route `src/routes/api/public/cron/inventory-sync.ts`:
- Bearer-token protected (`CRON_SECRET`)
- Iterates `imported_products`, batches by supplier, fetches current stock, pushes deltas to Shopify, logs to `sync_jobs`
- You point an external scheduler (cron-job.org, EasyCron, GitHub Actions, or pg_cron) at the stable URL `https://project--<id>.lovable.app/api/public/cron/inventory-sync` hourly.

### 5. Auth
Email/password + Google via Lovable Cloud. Two roles: `admin` (manages credentials, markup rules, users) and `operator` (import & sync). Stored in `user_roles` table with `has_role()` security-definer function.

### 6. UI (operator dashboard, protected by `_authenticated/`)
- `/auth` — sign in / sign up
- `/dashboard` — last sync status, totals, error feed
- `/suppliers` — manage each supplier's credentials + test connection
- `/import` — pick supplier, search by style #/keyword, preview variants & cost, apply markup, push to Shopify
- `/products` — list of imported products with Shopify links, current cost vs. price, manual "resync" buttons
- `/markup` — markup rule editor
- `/sync` — sync job history with drill-down on errors
- `/settings` — team members & roles (admin only), cron URL + secret

## What I'll ask you for as we go
- **Supplier credentials** — entered through a form in the UI (stored encrypted in DB, not as env secrets, since they're per-account). For SanMar/S&S that's customer #, username/password, API token.
- **CRON_SECRET** — generated via `add_secret` so external schedulers can authenticate.

## Out of scope (v1)
- Order routing back to suppliers / dropship fulfillment automation (different surface area; tell me if you want this next)
- Multi-location Shopify inventory split
- Storefront / customer-facing site (this is an internal ops tool; your existing Shopify storefront stays as-is)

## Build order
1. Auth + roles + `_authenticated` shell + dashboard skeleton
2. DB schema (all tables, RLS, grants)
3. Shopify Admin helper + connection test
4. S&S Activewear integration first (cleanest REST) — full loop: search → import → inventory sync
5. SanMar (SOAP), then AS Colour and Otto Cap (feed-based)
6. Markup rules + apply on import / on price-sync
7. Cron endpoint + sync history UI
8. Polish: error retries, batching, rate limiting per supplier

Want me to proceed with this plan, or trim/reorder anything (e.g. start with a different supplier, skip roles, defer cron)?
