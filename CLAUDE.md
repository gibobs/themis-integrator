# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`themis-integrator` is an **open-source reference integrator** for Gibobs's Themis API. It's a
teaching tool: it shows, with real runnable code, how to create operations (handoff / async / sync
S2S), track their creation status, list & inspect them, consume the change-feed (drift), and
reconcile your `externalId` against Themis with write-back. It ships in **mock mode by default**, so
it runs end-to-end with **no credentials and no network**.

Depth beyond this file lives in **[`README.md`](README.md)** (usage walkthrough, the two
identifiers, real-vs-mock config) and **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** (layers,
request flow diagrams, data model, how the mock works, design decisions). Read `docs/ARCHITECTURE.md`
before making structural changes.

## Commands

```bash
corepack enable          # enables the pinned Yarn 4 (packageManager field) — required
yarn install
cp .env.example .env.local
yarn dev                 # dev server at http://localhost:3000 (mock mode by default)

yarn lint                # ESLint (eslint-config-next)
yarn types:check         # next typegen + tsc --noEmit  — the real correctness gate
yarn build               # production build
yarn db:reset            # delete both local SQLite DBs (integrator + mock) to start clean
```

**There is no test framework.** The only automated checks are `yarn types:check` and `yarn lint` —
run both after non-trivial changes. TypeScript is `strict` with `noUncheckedIndexedAccess`, so index
access yields `T | undefined`; handle it.

## Language & style conventions

- **All docs, code comments, commit messages, and UI copy are in Spanish.** Match this when writing
  comments or docs. Code identifiers are English.
- When creating or editing docs under `content/docs` or any MDX/Markdown, use the **`docs-style`
  skill** — it holds the terminology and tone rules (e.g. never say "polling"; the domain term is
  *consulta periódica*).
- Formatting is Prettier-enforced: **tabs** (width 2), print width 100, single quotes, semicolons,
  trailing commas everywhere. Import alias: `@/*` → `./src/*`.

## Architecture — the load-bearing invariants

**1. The browser never sees Themis credentials.** This is the central design rule. Every call to
Themis goes through a **BFF route handler** under `src/app/api/**` that runs server-side only. The
browser talks only to those routes, via `src/lib/client/api.ts` (`apiFetch`). The Themis SDK
(`src/lib/themis/**`) and the DB layer (`src/lib/db/**`) are marked `import 'server-only'` — do not
import them into client components.

**2. The SDK is layered (bottom → top).** `config.ts` (env → base URL, credentials, mock flag) →
`token.ts` (M2M token exchange + in-memory cache, retries once on 401) → `http.ts` (transport;
retries 429/5xx with exponential backoff honoring `Retry-After`; also `withCapture`) → `client.ts`
(authenticated request, applies `Prefer` and `Idempotency-Key`) → `intake.ts` (writes) / `query.ts`
(reads). Compose it with `getThemisClient()` from `@/lib/themis`, which returns
`{ config, client, intake, query, getExchanges }`. `THEMIS_MOCK=1` swaps the transport for a local
SQLite simulation (`src/lib/themis/mock`) — the rest of the SDK is unchanged.

**3. Two separate SQLite databases** (via `better-sqlite3`, a native module — hence
`serverExternalPackages` in `next.config.ts`): `data/integrator.db` is *your* side (the
`externalId ↔ operationId` mapping, known status, change-feed cursor `since`, audit log);
`data/themis-mock.db` is the simulated *Themis* side, only present in mock mode. Keep them separate —
never merge integrator state into the mock. Schema + WAL setup live in `src/lib/db/db.ts`.

**4. Every BFF route follows the same shape** (`src/lib/server/respond.ts` helpers):
- `audited({ method, path, note }, fn)` wraps the Themis call, times it, and writes an audit-log row.
- `problemResponse(error, exchanges?)` turns *any* error into `application/problem+json` — so the UI
  always gets the same error contract Themis exposes. The **stable field to branch on is `code`**;
  never parse `detail`.
- `withExchanges(data, exchanges)` attaches captured HTTP exchanges under the `_themis` key.
- Pattern: capture a live `exchanges` ref right after `getThemisClient()` so `catch` can still attach
  it if the call fails. See `src/app/api/operations/route.ts` as the canonical example.

**5. The request/response inspector (`_themis`) is a first-class feature, not debug noise.**
`withCapture` records each exchange with **secrets redacted at the server** (bearer token, M2M
`apiSecret`/`token` → `«redactado»`). Exchanges reach the UI two ways — server pages read
`themis.getExchanges()` and pass props; BFF routes attach them under `_themis` in the body (success
*and* error). `RequestInspector` renders them. When adding a screen that calls Themis, wire up its
inspector too, and never let a raw credential escape the capture layer.

**6. Two-layer idempotency.** The RFC `Idempotency-Key` (per write, network-retry safety) and your
`externalId` (unique per brand, business-duplicate safety) are distinct — don't use one where the
other belongs. On create, the BFF reuses the stored `Idempotency-Key` when a local row already exists
for that `externalId` (a truly idempotent retry).

**Other conventions:** cursors (`nextCursor`, change-feed `since`) are opaque — store and echo them
verbatim, never interpret. List/change-feed responses are a PII-free index; detail (with PII) is
fetched one operation at a time. An operation that isn't yours returns `404` (not `403`). Pages that
read Themis or the DB set `export const dynamic = 'force-dynamic'`.
