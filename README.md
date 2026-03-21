This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

1. Connect the repo and import the project in [Vercel](https://vercel.com/new).
2. Set **Environment variables** — see **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** and [`.env.example`](.env.example).
3. Production **Google OAuth**: add your Vercel URL to **Authorized redirect URIs** and set `GOOGLE_REDIRECT_URI` + `NEXTAUTH_URL` accordingly.
4. `vercel.json` sets **`regions: ["fra1"]`** and **300s** `maxDuration` for scan API routes. With Supabase progress columns (see **`docs/supabase-scan-progress.sql`**), scans can return **202** and the UI polls **`/api/scan/status/:id`**. Without those columns, scans run synchronously with a **295s** default soft budget (`SCAN_ROUTE_BUDGET_MS`).

More: [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs).
