# Architecture decision records

Decisions that would be expensive to reverse: tenancy model, auth model, datastore,
schema and API contracts, deploy pipeline, and deliberate trade-offs against the obvious
approach.

Not recorded here: routine library choices, naming, file layout, or anything a reader
could re-derive from the code in a minute.

**Never edit a decision to reflect a change of mind.** Change its `Status` to
`Superseded by ADR-0NN`, leave the body untouched, and add a new record explaining what
changed since.

| # | Decision | Status |
|---|---|---|
| [001](ADR-001-two-identity-domains.md) | Platform owners and organization owners are separate identity domains | Accepted |
| [002](ADR-002-combined-admin-consultant.md) | ADMIN and CONSULTANT are one role, scoped by assignment | Accepted |
| [003](ADR-003-postgres-job-queue.md) | Asynchronous work is a Postgres queue drained by Railway Cron | Accepted |
| [004](ADR-004-tenant-scope-from-session.md) | Tenant scope comes from the session, and the database enforces it too | Accepted |
| [005](ADR-005-raw-sql-no-orm.md) | Hand-written parameterised SQL, no ORM | Accepted |
| [006](ADR-006-forward-only-migrations-on-deploy.md) | Forward-only migrations, applied automatically before each deploy | Accepted |
| [007](ADR-007-otp-by-email-behind-adapter.md) | OTP is delivered by email via Resend, behind a delivery adapter | Accepted |
| [008](ADR-008-bmad-as-execution-method.md) | BMAD is the planning and execution method | Accepted |
| [009](ADR-009-programme-snapshot-on-assignment.md) | Assigning a programme snapshots it; the template is never referenced live | Accepted |

## Inherited context

Three of these follow decisions already recorded in the user's Knowledge Base for
TempleOS and TaskFlow HR, rather than being reasoned from scratch:

- ADR-001 follows TempleOS ADR-003 (separate tenant and platform sessions)
- ADR-004 follows TempleOS ADR-004 (tenant identity from trusted boundaries)
- ADR-005 follows TempleOS ADR-002 (Postgres repositories, no ORM)

Two deliberately *depart* from that precedent, because the Knowledge Base records the
resulting problem:

- ADR-006 runs migrations automatically on deploy — TempleOS runs them manually and
  documents the production incident that caused.
- Environment is validated at boot — TempleOS validates nothing at startup and documents
  that a missing variable fails at first use rather than at deploy.
