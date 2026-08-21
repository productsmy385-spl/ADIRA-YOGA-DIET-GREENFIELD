# Adira

Multi-tenant yoga therapy and wellness management platform.

Personalised yoga and diet programmes, daily activity tracking, check-ins, progress
reporting, and notifications — for wellness organisations, the consultants who deliver
care, and the customers who receive it.

**Status: Phase 0 complete.** Foundation, architecture, security model, schema design,
and infrastructure. No authentication and no feature surfaces exist yet — see
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

Next.js 16 (App Router) · TypeScript (strict) · React 19 · Tailwind v4 · PostgreSQL with
hand-written parameterised SQL, no ORM · Railway · Vitest · Node 24.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill it in — see the comments in that file
npm run dev
```

Generate the secrets it asks for with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`SESSION_SECRET` and `OWNER_SESSION_SECRET` must differ — the app refuses to boot
otherwise, for reasons in [ADR-001](decisions/ADR-001-two-identity-domains.md).

There is no database yet. Phase 1 provisions Railway PostgreSQL; until then
`npm run dev` serves the foundation page and `/api/health` reports `degraded`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm test` | vitest |
| `npm run migrate` | apply pending migrations |
| `npm run migrate:dry` | list pending migrations, change nothing |

CI runs lint, typecheck, migrations, tests, and build on every push and pull request.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | shape, layers, request path, tenancy invariants |
| [SECURITY](docs/SECURITY.md) | threat model, controls in place, gaps with owners |
| [AUTHENTICATION](docs/AUTHENTICATION.md) | passkeys, OTP, sessions — designed, not built |
| [RBAC](docs/RBAC.md) | identity domains, role ladder, rank rules |
| [DATABASE](docs/DATABASE.md) | migration workflow, schema shape, the enum trap |
| [RAILWAY](docs/RAILWAY.md) | environments, variables, cron, release checklist |
| [TESTING](docs/TESTING.md) | conventions, database-test rules, required suites |
| [BRANDING](docs/BRANDING.md) | naming, the placeholder logo, colour tokens |
| [ROADMAP](docs/ROADMAP.md) | phase order, open questions |
| [decisions/](decisions/) | architecture decision records |

`CLAUDE.md` holds the short list of invariants that must not be broken.

## The rules that matter most

1. Tenant scope comes from the session, never from client input.
2. Platform owners and tenant users are separate identity domains that never mix.
3. `ADMIN` reaches assigned customers only; `ORG_OWNER` reaches the organization.
4. SQL lives only in repositories, always parameterised.
5. Migrations are forward-only and never edited after they are applied.
6. Colour is defined once, in `globals.css`.
