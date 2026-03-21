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
- Scan routes use a **55s** in-function budget and **60s** Vercel `maxDuration` in `vercel.json` + route segment config.
- Deployment region defaults to **`fra1`** (Frankfurt) via `vercel.json` for lower latency to Europe/Israel.

### Plan limits (important)

- **Serverless duration**: `maxDuration: 60` often requires a **Vercel Pro** (or higher) plan. On **Hobby**, the platform may cap functions at **10s** — long scans can still be killed by Vercel even though the app returns **504** after 55s when the budget hits first.
- If `vercel.json` → `functions` paths ever fail validation, Next.js still reads `export const maxDuration = 60` from each route file; adjust paths under `functions` to match your repo layout if the dashboard shows errors.

### Timeout behavior

- The **55s** limit uses `Promise.race`: work may continue briefly in the background after a timeout, but the client gets **504** with a clear message. Individual HTTP calls (PageSpeed, crawl, Google) keep their own shorter axios timeouts where configured.
