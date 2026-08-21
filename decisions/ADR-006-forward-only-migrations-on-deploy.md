# ADR-006 — Forward-only migrations, applied automatically before each deploy

**Decision:** Schema evolves through numbered, forward-only SQL files applied in filename
order, each in its own transaction, tracked by full filename. The runner executes as
Railway's `preDeployCommand`, so a deploy cannot succeed against an unmigrated database.

**Why:** The forward-only part follows TempleOS ADR-005 — executable, reviewable schema
history with no rollback machinery to maintain.

The automatic part is a deliberate *departure* from that project. TempleOS runs
`npm run migrate` manually, and its KNOWN-ISSUES.md records the result: "A deploy
succeeds, then production throws at runtime on a missing column or table," having already
caused one production incident. Starting a new project by reproducing a known incident
would be a poor use of the lesson.

**Alternatives considered:**

- *Manual migration, as TempleOS does* — safest against a bad migration taking down a
  deploy, at the cost of the failure mode above. Rejected: it trades a loud, contained
  failure for a silent, live one.
- *Migrate on application boot* — no separate step, but every replica races to migrate,
  and a failure leaves a half-started application rather than a failed deploy.
- *Pre-deploy step* — chosen. The migration runs once, before traffic moves, and a
  failure aborts the deploy with the old version still serving.

**Chosen approach:** `scripts/migrate.mjs`, with the planning logic split into the pure,
tested `scripts/migration-plan.mjs`. Four rules the runner enforces rather than trusts:

1. Filenames must be `NNN_description.sql` with a zero-padded sequence. Unpadded, `10_`
   sorts before `9_` and the order silently changes as the project grows.
2. No two migrations may share a sequence number.
3. **Checksums are verified.** An applied migration that has since been edited is a hard
   error — "never edit an applied migration" becomes something the tool enforces rather
   than something the reviewer must remember.
4. One transaction per file, under a **PostgreSQL advisory lock** so concurrent replicas
   cannot both decide the same migration is pending.

**Impact:**

- No automatic down-migrations. Rolling back a deploy does **not** roll back its
  migration; a mistake is corrected by a new forward migration.
- Migrations must therefore be backward-compatible with the currently-running code, since
  they apply *before* the new version serves traffic. Renames become add–backfill–drop
  across three deploys.
- **The enum trap:** one transaction per file means an enum label added by
  `ALTER TYPE … ADD VALUE` cannot be used in the same migration, because PostgreSQL
  forbids using it before commit. Add the value in one migration, use it in a later one.
  TaskFlow HR hit this exact failure; `docs/DATABASE.md` documents it.

**Status:** Accepted

**Date:** 2026-08-21
