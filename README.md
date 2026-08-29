# hishab

Every dirham, accounted for. Upload bank statements — text PDFs, scans, photos, CSV or Excel —
and hishab turns them into verified transactions, budgets, recurring-charge tracking and trends.
Built for AED.

## How it works

1. **Parse in the browser** — files never leave as documents. A Web Worker extracts
   coordinate-aware text from PDFs (table columns survive), renders scanned pages to images,
   and normalizes CSV/Excel rows. Up to 10 files at a time, processed in parallel.
2. **Transcribe on the server** — page batches fan out as parallel model calls (bounded pool)
   that transcribe raw transaction rows only. The model never computes a single total.
3. **Verify in code** — date-format disambiguation (DD/MM vs MM/DD), integer-fils math,
   running-balance validation, and reconciliation against printed opening/closing balances.
4. **Review before commit** — every row is shown, editable, with duplicates flagged.
   Nothing is stored until the user approves.
5. **Analyze deterministically** — budgets, pace projections, recurring detection,
   month-over-month, top merchants and anomaly flags are all SQL/TypeScript over stored rows.

## Stack

- TanStack Start (React 19, file-based routing, server functions) on Vite 8 + Nitro
- Neon Postgres + Drizzle ORM
- better-auth (email/password + optional Google OAuth)
- Tailwind v4 + shadcn/ui, Recharts, TanStack Query/Virtual
- Deployed on Vercel (auto-detected, Fluid Compute)

## Local development

```sh
npm install                 # Node >= 22.12
cp .env.example .env        # then fill in the values below
npm run db:push             # create tables in your Neon database
npm run db:seed             # system categories + UAE merchant dictionary
npm run dev                 # http://localhost:8080
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | statement analysis engine |
| `DATABASE_URL` | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | session signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | app origin, e.g. `http://localhost:8080` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional Google sign-in |

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel (framework auto-detected).
2. Add the **Neon** integration from the Vercel Marketplace — it injects `DATABASE_URL`.
3. Set the remaining env vars above (`BETTER_AUTH_URL` = your production URL).
4. Run `npm run db:push && npm run db:seed` once against the production `DATABASE_URL`.
5. Deploy. Analysis endpoints run with `maxDuration: 300` (configured in `vite.config.ts`).

## Scripts

- `npm run dev` / `build` / `preview`
- `npm test` — vitest unit tests for the verification, dedup, recurring and normalization cores
- `npm run lint` / `format`
- `npm run db:generate` / `db:push` / `db:seed`
