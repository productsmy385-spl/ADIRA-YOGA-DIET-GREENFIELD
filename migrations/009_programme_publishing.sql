-- 009_programme_publishing.sql
--
-- Programme lifecycle: DRAFT -> PUBLISHED -> ARCHIVED.
--
-- One nullable timestamp, not a status enum. `archived_at` already exists and already
-- means "no longer offered", so the third state costs exactly one column and the three
-- states derive from two timestamps:
--
--   DRAFT      published_at IS NULL     AND archived_at IS NULL
--   PUBLISHED  published_at IS NOT NULL AND archived_at IS NULL
--   ARCHIVED   archived_at  IS NOT NULL
--
-- WHY NOT AN ENUM
--
-- An enum would duplicate information `archived_at` already carries, and the two could
-- then disagree — a row marked PUBLISHED with archived_at set has no defined meaning, and
-- nothing would stop it. Deriving the state means the contradiction is unrepresentable.
-- Timestamps also answer "when", which a status label throws away.
--
-- ADDITIVE. Existing rows become DRAFT, which is the safe default: a programme cannot be
-- assigned until someone deliberately publishes it. That is a deliberate behaviour change
-- for existing rows and the right one — before this migration nothing enforced that a
-- half-built programme could not be handed to a member.

ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- A published programme must have something in it. An empty published programme generates
-- an empty schedule, which presents to the member as "your plan has no activities" and to
-- the admin as though the assignment silently failed.
--
-- Enforced in the service layer rather than as a CHECK: a table constraint cannot count
-- rows in another table, and a trigger doing so would fire on every item insert during
-- the build. `publishProgramme` performs the count inside its transaction.

CREATE INDEX IF NOT EXISTS programmes_assignable_idx
  ON programmes (organization_id, kind)
  WHERE published_at IS NOT NULL AND archived_at IS NULL;

COMMENT ON COLUMN programmes.published_at IS
  'Null = draft. Set = assignable. See archived_at for the third state (ADR-009, migration 009).';
