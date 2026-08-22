# Railway deployment

**Status: configured, not provisioned.** `railway.json` is committed and correct. No
Railway project exists yet — Phase 1 creates it. The Railway CLI is not installed on the
development machine.

## Why `railway.json` is in the repo

TempleOS keeps all Railway configuration in the dashboard, and its KNOWN-ISSUES.md
records the consequence: service config and cron schedules are invisible to git, so when
scheduled work stops there is nothing in the repository that explains what should have
been running. Committing the service config fixes half of that. Cron schedules still
cannot be committed — hence the table below, which is the authoritative record.

## Environments

| Environment | Purpose |
|---|---|
| `staging` | app + PostgreSQL. Also serves as the development database. |
| `production` | app + PostgreSQL. |

Never point local development at production. `DATABASE_URL` in `.env.local` must be a
staging or throwaway database.

## Service configuration

From `railway.json`:

| Setting | Value |
|---|---|
| Build | `npm run build` |
| Pre-deploy | `npm run migrate` |
| Start | `npm run start` |
| Healthcheck | `/api/health`, 60s timeout |
| Restart | on failure, max 3 retries |

### The build command must NOT run `npm ci`

`buildCommand` is `npm run build`, not `npm ci && npm run build`. Nixpacks already
installs dependencies in its own earlier layer, and it mounts a build cache at
`/app/node_modules/.cache`. A second `npm ci` tries to clear `node_modules` — including
that live mount — and the deploy fails with:

```
npm error EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'
```

The message names a cache directory and not the duplicated install, so it reads like a
Railway fault rather than a configuration one. It cost a failed deploy on 2026-08-22.

### Migrations run before the deploy goes live

`preDeployCommand` runs the migrator against the environment's database, and a failure
aborts the deploy. This is the direct fix for TempleOS's recorded production incident,
where a deploy succeeded and then threw at runtime on a missing column because
`npm run migrate` was a manual step someone had to remember.

Two properties make this safe to run automatically:

- The runner holds a **PostgreSQL advisory lock**, so concurrent replicas cannot both
  decide the same migration is pending.
- It **verifies checksums**, so a deploy carrying an edited migration fails loudly rather
  than diverging environments silently.

Forward-only means there is no automatic rollback. Rolling back a deploy does **not**
roll back its migration — correct a bad migration with a new forward one.

## Environment variables

Set in the Railway dashboard per environment. `.env.example` is the annotated list and
the better reference; it carries a comment per key.

Load-bearing for every request: `DATABASE_URL`, `SESSION_SECRET`, `OWNER_SESSION_SECRET`.
Also required: `CRON_SECRET`, `APP_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`.

Reference the database service rather than pasting a literal:

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`SESSION_SECRET` and `OWNER_SESSION_SECRET` **must differ** — boot fails if they match.

`APP_URL` must be the real origin per environment. WebAuthn derives its relying-party id
from it, so a stale value breaks passkey registration with an error that does not point
back here.

> Never put a real secret in the repository, in this file, in Linear, or in chat.

## Cron schedules

Configured in the Railway dashboard, invisible to git. **This table is the record — update
it when a schedule changes.**

| Route | Cadence | Purpose | Added |
|---|---|---|---|
| — | — | none yet | — |

`/api/cron/drain-jobs` arrives with Phase 11. All cron routes authenticate with
`Authorization: Bearer $CRON_SECRET` and are otherwise unauthenticated, so that token is
a production credential.

## Release checklist

1. `npm run typecheck && npm run lint && npm test && npm run build` — CI runs these, but
   check locally before opening the PR.
2. If the change adds a migration: confirm `npm run migrate:dry` lists it in the expected
   position, and that no applied migration was edited.
3. If the change adds an env var: add it to `.env.example` **and** to the schema in
   `src/lib/env-schema.ts`, then set it in both Railway environments. A key absent from
   the schema is not validated; a key absent from Railway fails the deploy.
4. If the change adds scheduled work: create the schedule in Railway and record it in the
   table above — it will not exist in git otherwise.
5. Watch `/api/health` after deploy. A 503 means the app is up but cannot reach
   PostgreSQL.

## Phase 1 will need

- A Railway project with `staging` and `production`, each with PostgreSQL.
- Environment variables set in both.
- `001_foundation.sql` applied for the first time.
- Confirmation that the healthcheck passes and the pre-deploy migration step runs.
