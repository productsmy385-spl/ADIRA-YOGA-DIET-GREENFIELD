# ADR-003 — Asynchronous work is a Postgres queue drained by Railway Cron

**Decision:** Background work — report generation, notification delivery, large exports —
runs through a `jobs` table claimed with `SELECT … FOR UPDATE SKIP LOCKED`, drained by
`/api/cron/*` routes that Railway Cron calls with `Authorization: Bearer $CRON_SECRET`.
No worker service, no Redis.

**Why:** The brief requires asynchronous reports and exports. The supplied poster showed
a Railway Worker service, Railway Cron, and an optional Railway Redis. That is three
additional runtime components before a single feature exists.

**Alternatives considered:**

- *Separate Railway worker service* — handles genuinely long work without HTTP timeouts.
  Costs a second deploy target, shared code packaging, and a new class of incident
  ("the worker is down") that nothing currently monitors.
- *Worker plus Redis*, as the poster draws it — most capacity, most moving parts, most
  expensive to run from day one, and Redis would become a second source of truth for
  sessions and rate limits.
- *Postgres queue drained by cron* — chosen.

**Chosen approach:** One datastore. A job's state is visible to the same SQL as
everything else, which matters more than it sounds: debugging a stuck report means a
`SELECT`, not attaching to a worker's logs. `SKIP LOCKED` lets two overlapping cron
invocations drain the same queue without blocking or double-processing. `jobs.attempts`
and `max_attempts` bound retries; `organization_id` is nullable so platform-level work
has a home.

This follows TempleOS ADR-001, which reaches the same conclusion: no queue, no worker,
scheduled work is Railway Cron hitting HTTP routes.

**Impact:** A job must be completable inside an HTTP request. Long work is expressed as
many small jobs rather than one long one — a 500-customer report becomes 500 rows, not
one. If that ever stops being enough, adding a worker is a new decision, but the job
*contract* would not have to change, which is what makes this cheap to revisit.

Cron schedules live in the Railway dashboard and are invisible to git. `docs/RAILWAY.md`
carries the authoritative table; TempleOS's KNOWN-ISSUES records what happens when that
record is not kept.

**Status:** Accepted

**Date:** 2026-08-21
