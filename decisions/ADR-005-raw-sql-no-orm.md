# ADR-005 — Hand-written parameterised SQL, no ORM

**Decision:** Persistence is organised as one repository module per domain under
`src/server/repositories/`, using hand-written parameterised SQL over `node-postgres`.
No ORM and no query builder.

**Why:** Both of the user's existing projects work this way — TempleOS records it as its
own ADR-002, and TaskFlow HR follows the same pattern — so the conventions, the traps,
and the reviewer's instincts all transfer. Adopting a different persistence model here
would mean maintaining two mental models across a portfolio of similar products.

The user's answer when asked was "postgreSQL", which did not distinguish between the
options offered (all three used PostgreSQL). Given the precedent in both existing
projects and the absence of any signal favouring an ORM, this was taken as raw SQL. The
assumption was stated explicitly in the approved plan.

**Alternatives considered:**

- *Drizzle* — types derive from the schema, which would eliminate the hand-mirrored enum
  drift this decision has to mitigate. Real benefit; breaks precedent.
- *Prisma* — best ergonomics, but contradicts the reasoning behind TempleOS ADR-002 most
  directly (hidden N+1s, ORM-imposed schema shapes) and its migration model differs from
  the forward-only `.sql` convention in ADR-006.

**Chosen approach:** `src/server/db/pool.ts` exposes `query`, `queryOne`, and
`transaction`. Repositories are the only modules permitted to import them — enforced by
ESLint (`adira/server-boundary`), not by convention. `unique-violation.ts` translates
PostgreSQL constraint codes so services can branch on "duplicate email" without knowing
what the index is called.

**Impact:**

- SQL exists only in `src/server/repositories/` and `src/server/db/`. Adding an ORM later
  would mean rewriting the whole persistence layer and would need a new decision.
- Composite foreign keys and partial unique indexes — both load-bearing in ADR-004 — are
  expressible directly, where an ORM would have made them awkward escape hatches.
- **The cost:** TypeScript enum unions in `src/server/db/types.ts` are hand-mirrored from
  SQL and can drift. TaskFlow HR lost a whole migration's lifetime to exactly this. The
  mitigation is `tests/enum-parity.test.ts`, which reads `pg_enum` from a live database
  and fails on any disagreement. It only runs where a test database is configured, so it
  protects CI rather than every laptop — which is the honest limit of the mitigation.

**Status:** Accepted

**Date:** 2026-08-21
