# Curatada (Quallection)

Personal "vault" for tracking high-end collections — guitars, watches, automobiles,
items of distinction ("iod" / collectibles). Next.js 14 App Router + Postgres +
NextAuth (JWT, multi-provider) + Tailwind. Deployed on Railway in production;
local dev runs against a docker-compose Postgres.

## Run

### Local dev

```bash
docker compose up -d db        # Postgres on :5432
npm install
npm run dev                    # http://localhost:3000
```

`.env.local` (gitignored) is what `next dev` reads; it should at minimum set
`DATABASE_URL=postgresql://quallection:quallection@localhost:5432/quallection`.
Migrations run automatically the first time Postgres starts (the
`docker-entrypoint-initdb.d` mount in `docker-compose.yml`).

Other commands:
- `npm run db:migrate` — applies new migrations from `db/migrations/*.sql`
  tracked in `schema_migrations` (each file applied once per transaction)
- `npm run build` — production build; mirrors what Railway does
- `node scripts/set-password.js <email> <password>` — admin reset; use via
  `railway run` or with an explicit `DATABASE_URL`

### Production (Railway)

The Dockerfile baked-in CMD is `sh -c "node scripts/migrate.js && exec node server.js"`,
so a deploy runs migrations then exec's the Next server. **Do not set a Custom
Start Command on the Railway service** — it overrides the Dockerfile CMD and
breaks this sequence.

Required env vars on the app service (in addition to platform-injected `PORT`):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Reference variable from the Postgres plugin: `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | **Public** Railway URL, e.g. `https://curatada-production.up.railway.app` — NextAuth callbacks 500 silently if this is wrong |
| `ANTHROPIC_API_KEY` | For valuations and pursuit search |
| `CRON_SECRET` | Optional; only needed if running a sibling cron service to hit `/api/pursuits/run-search` |
| `NODE_ENV` | Should be `production` (Railway sets this automatically; verify) |

Railway's "Networking → Public Networking → Target Port" must be **3000** (the
Dockerfile EXPOSEs it).

## Architecture

Four collection modules — **guitars, watches, automobiles, collectibles
(items_of_distinction / "iod")**. Originally ~95% copy-paste; Phase 3 of the
refactor (commits a3a580c, c6ebbd8, 114e690, 283ed74) collapsed the shared
machinery into factories. The per-module differences now live in small config
objects.

**Routes**:
- `app/<module>/page.tsx` (list) + `app/<module>/[category]/page.tsx`
- `app/api/<module>/route.ts` and `[id]/route.ts` are thin re-exports of
  `makeListHandlers(<moduleConfig>)` / `makeItemHandlers(<moduleConfig>)` from
  `lib/collection-handler.ts`
- `app/api/<module>/[id]/value/route.ts` re-exports `makeValuationHandler(<config>, <promptBuilder>)`
  from `lib/valuation-handler.ts`
- `app/api/<module>/[id]/valuations/route.ts` — history (user/AI prices)
- `app/api/<module>/import/route.ts` — CSV import
- `app/api/<module>/value-batch/route.ts` (guitars + watches only) — bulk AI valuation
- `app/api/<module>/[id]/images/...` (autos + iod only) — image add/remove
- `app/api/<module>-pursuits/...` — saved searches; cron runs through Claude
  `web_search_20250305` via `lib/pursuit-search.ts`
- `app/api/dashboard/route.ts` aggregates across all four modules
- `app/api/data/export` + `app/api/data/import` — JSON roundtrip
  (items + valuations; image rows skipped until object storage lands)

**Per-module config lives in `lib/collections/`**:
- `<module>.ts` → `CollectionConfig`: table names, FK columns, validation rules,
  field schema, condition rule, force-dynamic flag
- `<module>-prompt.ts` → the per-module Claude prompt for AI valuations

**Auth**: `lib/auth.ts` (NextAuth JWT, multi-provider). Every item table has
`user_id` (migration 012). Every API route MUST check session and filter by
`session.user.id` — the factories do this for you on the routes they own.

**Form shell** (Phase 3c/3d) — Add/Edit modals build on shared primitives:
- `lib/hooks/useImageUpload.ts` + `components/forms/ImagesEditor.tsx` for Add modals
- `lib/hooks/useEditImageList.ts` + `components/forms/EditImagesEditor.tsx` for
  Edit modals (handles existing-vs-new images, toDelete state, drag-reorder)
- `components/forms/ModalShell.tsx` (with `nested` prop for stacked modals) +
  `components/forms/ModalActions.tsx` (with `SaveCheckIcon` export)

## Conventions

- DB access via `query` / `queryOne` from `lib/db.ts` (parameterized only).
- `lib/db.ts` lazy-inits the `pg.Pool` on first call and **caches it on
  globalThis unconditionally** — see Gotchas. SSL is auto-enabled when
  `NODE_ENV === "production"`.
- Image upload: client POSTs to `/api/upload` → gets `{path: "/uploads/<uuid>.ext"}`
  → posts that path with the item create. Storage is local disk on whichever
  host is running, served by `/api/uploads/[...path]` (rewritten from
  `/uploads/*` in `next.config.mjs`).
- UI follows `Looks/DESIGN.md` ("Curated Sanctum" — dark, tonal layering, no
  1px borders for sectioning, gold/brass accents). Tailwind tokens in
  `tailwind.config.ts`.
- Module enable/disable is per-user in `user_modules` table, exposed via
  `useUserModules()` from `lib/UserModulesContext.tsx`. Always gate
  module-specific UI with `isEnabled("<module>")`.
- Commits flow through PRs (`gh pr create` + `gh pr merge --squash --delete-branch`).
  Auto-merge is allowed on the repo but has no CI gate yet, so it merges
  immediately when the PR is mergeable. Direct pushes to main are technically
  allowed but discouraged.

## Gotchas

- **`pg.Pool` MUST be cached as a singleton on globalThis in BOTH dev and
  production.** This is non-obvious — most "Next.js + Postgres" patterns
  online only cache in dev (for hot-reload). In production a per-query Pool
  leaks ~10 connections each, and under burst load (e.g. the data importer)
  blows past Railway Postgres's max_connections with `sorry, too many clients
  already`. The current `lib/db.ts` is correct; don't "fix" it by adding the
  dev-only check back.

- **TLS is required for hosted Postgres.** `lib/db.ts` and `scripts/migrate.js`
  both flip `ssl: { rejectUnauthorized: false }` when `NODE_ENV === "production"`.
  Without that, connection errors come back with an empty `.message` and look
  like a mystery — the migration script prints `code`, `severity`, `detail`,
  etc. as a fallback so you can actually see what failed.

- **Migrations are tracked in `schema_migrations`.** Each file applies once,
  in a transaction; new ones don't have to be idempotent. The docker-compose
  `db` service also auto-applies every `.sql` on first start via
  `docker-entrypoint-initdb.d`, so on a fresh local DB the migrate script
  will see all files as already applied. Railway's Postgres plugin does NOT
  do that bootstrap — migrations run on app boot via the Dockerfile CMD.

- **Cron auth is via shared secret.** `/api/pursuits/run-search` accepts
  either a signed-in browser session or `Authorization: Bearer ${CRON_SECRET}`.
  The route is excluded from the NextAuth middleware matcher so the cron
  service can reach it. Both the `app` and any cron service must receive
  the same `CRON_SECRET`. On Railway the cron container from `docker-compose.yml`
  doesn't deploy automatically — set it up as a separate service if needed.

- **Image storage is local disk.** Files live in `public/uploads/`, served
  by `app/api/uploads/[...path]/route.ts`. On Railway the container disk is
  ephemeral — uploads vanish on every redeploy. The export/import flow
  deliberately skips image rows for this reason. Phase 4 (object storage —
  S3 / R2 / Cloudflare Images) is the remediation but not yet done.

- **`claimOrphanedData` in `lib/auth.ts`** assigns every orphan row to the
  first OAuth user that signs in. Disable before opening signups.

- **Railway build phase has no `DATABASE_URL`.** `lib/db.ts` lazy-inits, so
  importing it doesn't throw during `next build`'s page-data collection.
  Don't reintroduce module-level Pool construction or the build breaks.

## When adding a feature to "all four modules"

The Phase 3 abstractions cover the list / item-CRUD / valuation routes — a
fifth module costs roughly a config file + a prompt file + 6-line wrappers
for the API routes. Adding a feature on top of the abstractions:

1. If it's a new column on the item table: add a migration, update the
   `CollectionConfig` in `lib/collections/<module>.ts` (the `fields` array),
   and add the input to the Add/Edit modal field JSX.
2. If it's new behaviour on the route: prefer extending the factory in
   `lib/collection-handler.ts` rather than overriding in the route file.
3. If it's UI-only: build on `ModalShell`/`ModalActions`/`ImagesEditor` for
   consistency.

If you find yourself reaching for raw copy-paste again, treat that as a
signal to extend the factory.

## Admin tools

- `scripts/set-password.js` — reset a user's password against any DB:
  ```
  railway run node scripts/set-password.js user@example.com 'pass'
  ```
- `scripts/migrate.js` — manual migration run (already auto-runs on Railway
  deploy via the Dockerfile CMD).

## Management API (cross-app dashboard contract)

This app implements the standard org-wide management API at
`/api/mgmt/v1/*` so a central dashboard can pull metrics. Contract is
identical across every app in the org — see
`~/Downloads/MANAGEMENT_API_PLAYBOOK.md` for the master spec; the bits
specific to this app:

- **App slug**: `curatada` (returned in the envelope's `app` field).
- **Endpoints**: `GET /health`, `GET /summary`, `GET /users` (cursor-paginated
  via `?cursor=&limit=`; default 100, max 500). Implementation in
  `app/api/mgmt/v1/*/route.ts`; shared bits in `lib/mgmt/`.
- **Auth**: `Authorization: Bearer ${MGMT_API_TOKEN}` (constant-time compare
  via `crypto.timingSafeEqual`). If `MGMT_REQUIRE_INTERNAL=1`, requests with
  any `x-forwarded-for` header are rejected as well — pairs with private
  Railway DNS (`curatada.railway.internal`) so public-edge probes can't
  reach the API at all. Without `MGMT_API_TOKEN` set, every endpoint
  returns 503.
- **Rate limit**: 60 req/min per source IP via an in-memory sliding window
  (`lib/mgmt/rateLimit.ts`), singleton on `globalThis`. Single-replica safe;
  swap to Redis if scaled out.
- **`users_active_30d` definition** (app-specific): signed in within 30 days
  AND has at least one item (any of the four collections) added or updated
  within the same 30 days. Defined in the SQL in `lib/mgmt/data.ts` — the
  dashboard does not redefine it client-side.
- **`last_login_at`** is stamped (best-effort, never blocks auth) in
  `lib/auth.ts` for both the Credentials `authorize` path and the OAuth
  `signIn` callback. Migration `015_users_last_login_at.sql` adds the
  column + index.
- **Middleware exclusion**: `/api/mgmt/*` is excluded from the NextAuth
  middleware matcher in `middleware.ts` — the mgmt API has its own auth
  layer and must not be gated by NextAuth.

Smoke test once deployed:

```bash
curl -H "Authorization: Bearer $MGMT_API_TOKEN" \
     https://curatada-production.up.railway.app/api/mgmt/v1/health
```

## Phase status

- **Phase 1** (auth lockdown — `/api/upload`, all `[id]/value`, auto/iod
  pursuits, `value-batch`, `run-search`) — done (PR Initial import).
- **Phase 2** (schema_migrations tracker + dedup of 009) — done.
- **Phase 3a/b/c/d** (collection handler factory, valuation handler factory,
  Add modal form shell, Edit modal form shell) — done.
- **Phase 4** (object storage for uploads) — not started; pick a provider
  (S3 / R2 / Cloudflare Images) before tackling.
- **Phase 5** (Next 15 upgrade) — not started; non-blocking; some `npm audit`
  advisories only have fixes on the 15.x line.
