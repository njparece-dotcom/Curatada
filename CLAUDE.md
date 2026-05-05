# Curatada (Quallection)

Personal "vault" for tracking high-end collections. Next.js 14 App Router + Postgres
+ NextAuth (JWT, multi-provider) + Tailwind. Single-VM Docker deploy with sibling
cron container.

## Run

- `npm run dev` — Next dev server
- `npm run db:migrate` — applies new migrations from `db/migrations/*.sql`, tracked in
  `schema_migrations` (each file applied once, transactionally)
- `docker compose up` — db + app + cron (daily pursuit search at 08:00)

Required env: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
(used by the cron container to authenticate to `/api/pursuits/run-search`).
Optional OAuth: `GOOGLE_CLIENT_ID/SECRET`, `AZURE_AD_*`, `APPLE_*`.

## Architecture

Four parallel "collection" modules — **guitars, watches, automobiles, collectibles
(items_of_distinction / "iod")**. Each has its own tables, API routes, and UI
components. They are ~95% copy-paste. Treat them as a template, not an abstraction:
**a fix in one almost always needs to be repeated in the other three.**

- Routes: `app/<module>/page.tsx` (list) + `app/<module>/[category]/page.tsx`
- APIs: `app/api/<module>/route.ts` (GET list / POST create), `[id]/route.ts`
  (GET / PATCH / DELETE), `[id]/value/route.ts` (Claude valuation),
  `import/route.ts` (CSV), some have `value-batch/route.ts`
- Pursuits: `app/api/<module>-pursuits/...` — saved searches that the cron runs
  through Claude `web_search_20250305` (`lib/pursuit-search.ts`)
- Aggregation: `app/api/dashboard/route.ts` joins all four
- Auth: `lib/auth.ts` (NextAuth JWT). Every item table has `user_id` (migration 012);
  every API route MUST filter by `session.user.id`.

## Conventions

- DB access via `query` / `queryOne` from `lib/db.ts` (parameterized only)
- Image upload: client POSTs to `/api/upload` → gets `{path: "/uploads/<uuid>.ext"}`
  → posts that path with the item create. Storage is local disk, served by
  `/api/uploads/[...path]` (rewritten from `/uploads/*` in `next.config.mjs`).
- UI follows `Looks/DESIGN.md` ("Curated Sanctum" — dark, tonal layering, no 1px
  borders for sectioning, gold/brass accents). Tailwind tokens in `tailwind.config.ts`.
- Module enable/disable is per-user in `user_modules` table, exposed via
  `useUserModules()` from `lib/UserModulesContext.tsx`. Always gate module-specific
  UI with `isEnabled("<module>")`.

## Gotchas

- **Migrations are tracked in `schema_migrations`.** New migrations need not be
  idempotent; each file applies once. The Postgres docker init mount also
  auto-applies every `.sql` on first DB start, so `npm run db:migrate` against an
  initdb-bootstrapped DB will create the tracker and mark everything as already
  applied (the migrations are still idempotent today, but new ones don't have to
  be).
- **Cron auth is via shared secret.** `/api/pursuits/run-search` accepts either a
  signed-in browser session or `Authorization: Bearer ${CRON_SECRET}`. The route is
  excluded from the NextAuth middleware matcher so cron can reach it. Both the
  `app` and `cron` containers must receive the same `CRON_SECRET` (see `.env`).
- **`claimOrphanedData` in `lib/auth.ts`** assigns every orphan row to the first
  OAuth user that signs in. Disable before opening signups.
- **Image storage is local disk** — won't survive horizontal scaling.

## When adding a feature to "all four modules"

1. Pick guitars as the canonical example, change there first.
2. Repeat in watches, automobiles, iod — including the API route, the DB schema
   migration, the Add/Edit modal, the Detail modal, the Card, the ListView, and
   the dashboard aggregator.
3. Verify auth (`session.user.id` + `WHERE user_id = $N`) in every new endpoint.
4. Update `lib/types.ts` for each module's type.

If you find yourself doing this for the *fifth* time, stop and factor out a
handler factory + form shell first.
