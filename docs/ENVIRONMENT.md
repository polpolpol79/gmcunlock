# Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and locally in `.env.local`).  
See also [`.env.example`](../.env.example) for a quick copy-paste template.

| Variable | Scope | Required | Purpose |
|----------|--------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Yes* | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Yes* | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes* | Inserts/reads `scan_results` (keep secret) |
| `ANTHROPIC_API_KEY` | Server only | Yes | Claude analysis (`/api/scan/free`, `/api/scan/full`) |
| `PAGESPEED_API_KEY` | Server only | Yes | Google PageSpeed Insights API |
| `GOOGLE_CLIENT_ID` | Server only | For OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Server only | For OAuth | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Server only | For OAuth | Exact callback URL registered in Google Cloud (e.g. `https://<project>.vercel.app/api/google/oauth/callback`) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Server only | No | Enables Google Ads data in full scan |
| `SHOPIFY_STORE_DOMAIN` | Server only | No | e.g. `your-store.myshopify.com` for Admin API snapshot |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Server only | No | Shopify Admin API access token |
| `SHOPIFY_CLIENT_ID` | Server only | No | Reserved for future Shopify OAuth |
| `SHOPIFY_CLIENT_SECRET` | Server only | No | Reserved for future Shopify OAuth |
| `NEXTAUTH_SECRET` | Server only | **Recommended** | Signs mock `payment_token` (falls back to weak default if unset) |
| `NEXTAUTH_URL` | Server only | Recommended | Canonical site URL (OAuth redirect base in callback) |

\*Required if you use Supabase persistence for scans.

## Vercel / production notes

- Set `GOOGLE_REDIRECT_URI` and `NEXTAUTH_URL` to your **production** domain.
- Scan routes use **`export const maxDuration = 300`** plus matching **`vercel.json`** `functions` entries (see repo). **Async scans** on Vercel use `waitUntil` after a **202** response so work can continue while the UI polls **`GET /api/scan/status/:scanId`**.
- **Synchronous fallback** (no Supabase progress columns, or `SCAN_SYNC_ONLY=1`, or non-Vercel dev): a **`SCAN_ROUTE_BUDGET_MS`** soft cap (default **295000**) still applies via `Promise.race` to avoid hanging the client.
- Deployment region defaults to **`fra1`** (Frankfurt) via `vercel.json` for lower latency to Europe/Israel.

| Variable | Scope | Purpose |
|----------|--------|---------|
| `SCAN_SYNC_ONLY` | Server | If `1`, disable `waitUntil` background scans (always run synchronously in the request). |
| `SCAN_ROUTE_BUDGET_MS` | Server | Override sync-scan time budget (ms). Default 295000. |

### Async scan database columns

Run **[`docs/supabase-scan-progress.sql`](supabase-scan-progress.sql)** on your `scan_results` (or `scans`) table so rows can be created as **`running`** and updated with **`scan_phase`** / **`scan_phase_detail`**. Without these columns, `createPendingScanResult` fails and the app uses the **sync** path only.

### Plan limits (important)

- **`maxDuration: 300`** requires **Vercel Pro** (or compatible plan). On **Hobby**, platform limits may still stop long functions; async + polling improves UX but does not remove hard caps.
- If `vercel.json` → `functions` paths ever fail validation, Next.js still reads `export const maxDuration` from each route file; adjust paths under `functions` to match your repo layout if the dashboard shows errors.

### Timeout behavior

- **Sync path**: the budget uses `Promise.race`; the client may receive **504** when the budget is exceeded. Individual HTTP calls (PageSpeed, crawl, Google) keep their own shorter axios timeouts where configured.
- **Async path**: the HTTP response returns quickly (**202**); progress is read from Supabase via the status API until **`scan_status`** is **`done`** or **`error`**.
