-- 004_programmes_and_activities.sql
--
-- The domain: yoga and diet libraries, programme templates, customer assignments, the
-- daily activity engine, and the wellness check-in.
--
-- THE SHAPE FOLLOWS ADR-009
--
-- Templates and customer plans are PEER tables, not a table and a view over it.
-- Assigning a programme COPIES its structure into `assignment_items`; the template is
-- never read again when rendering or scoring that customer's plan.
--
-- The duplication is the point. If assignment held a live reference, a consultant
-- editing "Foundation — Week 2" on Thursday would retroactively change what every
-- assigned customer was supposed to have done on Monday, and every adherence figure
-- scored against it would silently stop meaning what it says. Nothing would error.
--
-- Do not "normalise this away" later.
--
-- Every customer-linked table carries organization_id and references `users` by the
-- COMPOSITE key, so a row spanning two tenants is unrepresentable (ADR-004).


-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

CREATE TYPE programme_kind AS ENUM ('YOGA', 'DIET');

CREATE TYPE difficulty_level AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

CREATE TYPE meal_slot AS ENUM ('BREAKFAST', 'LUNCH', 'SNACK', 'DINNER');

CREATE TYPE assignment_status AS ENUM (
  'DRAFT',      -- being built, generates no schedule
  'ACTIVE',
  'PAUSED',     -- schedules nothing; see docs/METRICS.md — a paused plan cannot miss
  'COMPLETED',
  'CANCELLED'
);

-- §16. PENDING is the initial state; MISSED is applied by the nightly sweep once the
-- scheduled day has passed. REVIEW_REQUIRED is a consultant workflow state and is
-- excluded from adherence entirely (docs/METRICS.md).
CREATE TYPE activity_status AS ENUM (
  'PENDING',
  'STARTED',
  'COMPLETED',
  'SKIPPED',
  'MISSED',
  'REVIEW_REQUIRED'
);


-- ---------------------------------------------------------------------------
-- Yoga library
-- ---------------------------------------------------------------------------

CREATE TABLE yoga_exercises (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid             NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name              text             NOT NULL CHECK (length(trim(name)) > 0),
  description       text,
  instructions      text,
  -- Kept separate from `instructions` because breathing guidance is read aloud during
  -- practice and is displayed on its own, not buried in a paragraph.
  breathing         text,

  default_duration_seconds integer   CHECK (default_duration_seconds IS NULL
                                            OR default_duration_seconds > 0),
  default_repetitions      integer   CHECK (default_repetitions IS NULL
                                            OR default_repetitions > 0),
  difficulty        difficulty_level NOT NULL DEFAULT 'BEGINNER',

  -- ImageKit file id (Phase 12) and a 3D reference key (Phase 15). Both nullable: an
  -- exercise is usable with neither, and neither may carry business rules.
  media_asset_id    uuid,
  model_reference   text,

  archived_at       timestamptz,
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),

  CONSTRAINT yoga_exercise_name_unique_per_org UNIQUE (organization_id, name)
);

CREATE INDEX yoga_exercises_org_idx
  ON yoga_exercises (organization_id, name) WHERE archived_at IS NULL;

CREATE TRIGGER yoga_exercises_set_updated_at
  BEFORE UPDATE ON yoga_exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Diet library
-- ---------------------------------------------------------------------------

CREATE TABLE meals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name              text        NOT NULL CHECK (length(trim(name)) > 0),
  description       text,
  instructions      text,
  -- Free text rather than grams: consultants prescribe "one bowl", "two rotis". Forcing
  -- a numeric quantity would make the common case unrepresentable.
  quantity          text,
  slot              meal_slot,

  -- Dietary tags, e.g. {vegetarian, gluten-free}. An array rather than a join table:
  -- these are filters, never entities with their own behaviour.
  tags              text[]      NOT NULL DEFAULT '{}',

  media_asset_id    uuid,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meal_name_unique_per_org UNIQUE (organization_id, name)
);

CREATE INDEX meals_org_idx ON meals (organization_id, slot) WHERE archived_at IS NULL;

CREATE TRIGGER meals_set_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Programme templates
-- ---------------------------------------------------------------------------

CREATE TABLE programmes (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid             NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  kind              programme_kind   NOT NULL,
  name              text             NOT NULL CHECK (length(trim(name)) > 0),
  description       text,
  duration_weeks    integer          NOT NULL DEFAULT 4 CHECK (duration_weeks > 0),
  difficulty        difficulty_level NOT NULL DEFAULT 'BEGINNER',

  -- Bumped on every edit. Copied onto an assignment as provenance, so "which version of
  -- Foundation was Anita given" stays answerable after the template has moved on.
  version           integer          NOT NULL DEFAULT 1 CHECK (version > 0),

  archived_at       timestamptz,
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),

  CONSTRAINT programme_name_unique_per_org UNIQUE (organization_id, kind, name)
);

CREATE INDEX programmes_org_kind_idx
  ON programmes (organization_id, kind) WHERE archived_at IS NULL;

CREATE TRIGGER programmes_set_updated_at
  BEFORE UPDATE ON programmes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- One row per scheduled thing, per day, in the template.
CREATE TABLE programme_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  programme_id      uuid        NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,

  -- Position within the programme, not a calendar date. A template has no dates; the
  -- assignment supplies the start and the schedule generator does the arithmetic.
  week_number       integer     NOT NULL CHECK (week_number >= 1),
  day_of_week       integer     NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  sequence          integer     NOT NULL CHECK (sequence >= 0),

  -- Exactly one of these, matching the programme's kind. Enforced by the CHECK below.
  yoga_exercise_id  uuid        REFERENCES yoga_exercises(id) ON DELETE RESTRICT,
  meal_id           uuid        REFERENCES meals(id) ON DELETE RESTRICT,

  duration_seconds  integer     CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  repetitions       integer     CHECK (repetitions IS NULL OR repetitions > 0),
  slot              meal_slot,
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT programme_item_one_target CHECK (
    (yoga_exercise_id IS NOT NULL AND meal_id IS NULL)
    OR
    (yoga_exercise_id IS NULL AND meal_id IS NOT NULL)
  ),

  CONSTRAINT programme_item_position_unique
    UNIQUE (programme_id, week_number, day_of_week, sequence)
);

CREATE INDEX programme_items_programme_idx
  ON programme_items (programme_id, week_number, day_of_week, sequence);

CREATE TRIGGER programme_items_set_updated_at
  BEFORE UPDATE ON programme_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Assignments — the customer's own plan (ADR-009)
-- ---------------------------------------------------------------------------

CREATE TABLE assignments (
  id                  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id         uuid              NOT NULL,
  assigned_by         uuid,

  kind                programme_kind    NOT NULL,

  -- Provenance only. NEVER read to render or score this plan — that is the whole of
  -- ADR-009. ON DELETE SET NULL because deleting a template must not delete the history
  -- of customers who followed it.
  source_programme_id uuid              REFERENCES programmes(id) ON DELETE SET NULL,
  source_version      integer,

  -- Copied from the template at assignment time, so the customer's plan keeps the name
  -- it had when they were given it.
  name                text              NOT NULL CHECK (length(trim(name)) > 0),

  starts_on           date              NOT NULL,
  duration_weeks      integer           NOT NULL CHECK (duration_weeks > 0),
  status              assignment_status NOT NULL DEFAULT 'DRAFT',

  paused_at           timestamptz,
  completed_at        timestamptz,

  created_at          timestamptz       NOT NULL DEFAULT now(),
  updated_at          timestamptz       NOT NULL DEFAULT now(),

  CONSTRAINT assignments_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT assignments_assigner_fk
    FOREIGN KEY (assigned_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL
);

-- A customer may hold one live plan per kind — one yoga, one diet. Two concurrent yoga
-- plans would double-schedule every day and make adherence meaningless.
CREATE UNIQUE INDEX assignments_one_live_per_kind_idx
  ON assignments (organization_id, customer_id, kind)
  WHERE status IN ('ACTIVE', 'PAUSED');

CREATE INDEX assignments_customer_idx
  ON assignments (organization_id, customer_id, status);

CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- The snapshot. Copied from programme_items at assignment, then editable per customer
-- without touching anybody else's plan.
CREATE TABLE assignment_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id     uuid        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,

  week_number       integer     NOT NULL CHECK (week_number >= 1),
  day_of_week       integer     NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  sequence          integer     NOT NULL CHECK (sequence >= 0),

  -- DENORMALISED ON PURPOSE. The title and instructions are copied, not joined, so that
  -- archiving or editing a library exercise cannot change what a customer was told to
  -- do last Monday. The library ids below are provenance, like source_programme_id.
  title             text        NOT NULL CHECK (length(trim(title)) > 0),
  instructions      text,
  breathing         text,
  quantity          text,

  duration_seconds  integer     CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  repetitions       integer     CHECK (repetitions IS NULL OR repetitions > 0),
  slot              meal_slot,
  notes             text,

  source_yoga_exercise_id uuid  REFERENCES yoga_exercises(id) ON DELETE SET NULL,
  source_meal_id          uuid  REFERENCES meals(id) ON DELETE SET NULL,
  media_asset_id          uuid,
  model_reference         text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assignment_item_position_unique
    UNIQUE (assignment_id, week_number, day_of_week, sequence)
);

CREATE INDEX assignment_items_assignment_idx
  ON assignment_items (assignment_id, week_number, day_of_week, sequence);

CREATE TRIGGER assignment_items_set_updated_at
  BEFORE UPDATE ON assignment_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Daily activities — the execution record (§16)
-- ---------------------------------------------------------------------------

CREATE TABLE daily_activities (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id         uuid            NOT NULL,
  assignment_id       uuid            NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  assignment_item_id  uuid            REFERENCES assignment_items(id) ON DELETE SET NULL,

  kind                programme_kind  NOT NULL,

  -- The DATE is what adherence is computed against, in the organisation's timezone
  -- (docs/METRICS.md). `scheduled_at` is the optional time-of-day hint.
  scheduled_for       date            NOT NULL,
  scheduled_at        timestamptz,

  started_at          timestamptz,
  completed_at        timestamptz,
  duration_seconds    integer         CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

  status              activity_status NOT NULL DEFAULT 'PENDING',
  notes               text,

  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT daily_activities_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  -- A completed activity must record when. Without this, "completed" rows with a null
  -- timestamp would silently drop out of every time-windowed adherence query.
  CONSTRAINT daily_activities_completion_consistency CHECK (
    (status = 'COMPLETED') = (completed_at IS NOT NULL)
  ),

  CONSTRAINT daily_activities_order CHECK (
    started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at
  ),

  -- One row per scheduled item per day. Regenerating a schedule must update rather than
  -- duplicate, or a day's denominator doubles and adherence halves.
  CONSTRAINT daily_activities_unique_slot
    UNIQUE (assignment_id, scheduled_for, assignment_item_id)
);

-- The customer's "today" query.
CREATE INDEX daily_activities_today_idx
  ON daily_activities (organization_id, customer_id, scheduled_for, kind);

-- The consultant's triage query and the nightly MISSED sweep.
CREATE INDEX daily_activities_pending_idx
  ON daily_activities (organization_id, scheduled_for)
  WHERE status IN ('PENDING', 'STARTED');

CREATE INDEX daily_activities_review_idx
  ON daily_activities (organization_id, customer_id)
  WHERE status = 'REVIEW_REQUIRED';

CREATE TRIGGER daily_activities_set_updated_at
  BEFORE UPDATE ON daily_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Daily check-in (§17)
-- ---------------------------------------------------------------------------
-- Deliberately small. §17 says collect only what the product needs, and this is health
-- information about identifiable people — every extra field is a liability, not a
-- feature.

CREATE TABLE daily_checkins (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id       uuid        NOT NULL,

  checkin_date      date        NOT NULL,

  -- 1..5 bands rather than free numbers, so trends are comparable between days and
  -- between people without implying more precision than self-reporting carries.
  mood              smallint    CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  sleep_quality     smallint    CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5),

  sleep_minutes     integer     CHECK (sleep_minutes IS NULL
                                       OR sleep_minutes BETWEEN 0 AND 1440),
  water_glasses     smallint    CHECK (water_glasses IS NULL
                                       OR water_glasses BETWEEN 0 AND 50),

  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT daily_checkins_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  -- One per customer per day. A second submission edits the first.
  CONSTRAINT daily_checkins_one_per_day
    UNIQUE (organization_id, customer_id, checkin_date)
);

CREATE INDEX daily_checkins_recent_idx
  ON daily_checkins (organization_id, customer_id, checkin_date DESC);

CREATE TRIGGER daily_checkins_set_updated_at
  BEFORE UPDATE ON daily_checkins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
