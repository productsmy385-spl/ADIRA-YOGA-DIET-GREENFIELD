-- 005_notifications_reports_media.sql
--
-- Notifications (Phase 10), reports (Phase 11), and media metadata (Phase 12).
--
-- Three domains in one migration because they share one shape: each is produced by the
-- job queue from ADR-003 and consumed by a surface that must not block on it.
--
-- MESSAGING IS ONE-WAY, BY DECISION.
--
-- The user settled this on 2026-08-22: consultant → customer notifications only. There
-- is deliberately NO `conversations` or `messages` table, no thread id, and no reply
-- path. A "consultant message" is a notification event with a sender, exactly as v2.0
-- describes it. See BMAD/01-analysis/PRODUCT-SCOPE.md.
--
-- Adding conversations later means adding tables. Building threads now and discovering
-- nobody wants them means carrying schema and UI that must still be kept working — the
-- cheaper direction to be wrong in.


-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

CREATE TYPE notification_channel AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- The events from §19. Each is a REASON, not a template — the wording lives in the
-- message, so changing copy never needs a migration.
CREATE TYPE notification_kind AS ENUM (
  'YOGA_REMINDER',
  'DIET_REMINDER',
  'ACTIVITY_REMINDER',
  'MISSED_ACTIVITY',
  'PLAN_UPDATED',
  'CONSULTANT_MESSAGE',
  'REPORT_READY',
  'APPOINTMENT_REMINDER',
  'WEEKLY_PROGRESS'
);

CREATE TYPE report_kind AS ENUM (
  'CUSTOMER_WEEKLY',
  'CUSTOMER_MONTHLY',
  'ORGANIZATION_WEEKLY',
  'ORGANIZATION_MONTHLY'
);

CREATE TYPE report_status AS ENUM ('PENDING', 'READY', 'FAILED');


-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id               uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid                   NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  recipient_id     uuid                   NOT NULL,
  -- NULL for system-generated notifications (reminders, reports). Set when a consultant
  -- deliberately sent it, so the customer can see who it came from.
  sender_id        uuid,

  kind             notification_kind      NOT NULL,
  title            text                   NOT NULL CHECK (length(trim(title)) > 0),
  body             text,

  -- Where tapping it should go, e.g. '/today'. Stored rather than derived so a
  -- notification's destination cannot drift when routes change under it.
  link             text,

  -- Which channels this was intended for. IN_APP is always implied; the others record
  -- what delivery was attempted, and `delivered_at` records that it happened.
  channels         notification_channel[] NOT NULL DEFAULT '{IN_APP}',
  delivered_at     timestamptz,
  delivery_error   text,

  read_at          timestamptz,
  created_at       timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT notifications_recipient_fk
    FOREIGN KEY (recipient_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT notifications_sender_fk
    FOREIGN KEY (sender_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL
);

-- The customer's bell: unread first, newest first.
CREATE INDEX notifications_unread_idx
  ON notifications (organization_id, recipient_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX notifications_recipient_idx
  ON notifications (organization_id, recipient_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
-- One row per user per kind. A MISSING row means defaults apply — the table records
-- only deviations, so a new notification kind does not require backfilling a row for
-- every user before it can be sent.

CREATE TABLE notification_preferences (
  id               uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid                   NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid                   NOT NULL,

  kind             notification_kind      NOT NULL,
  channels         notification_channel[] NOT NULL DEFAULT '{IN_APP}',

  created_at       timestamptz            NOT NULL DEFAULT now(),
  updated_at       timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT notification_preferences_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT notification_preferences_unique UNIQUE (organization_id, user_id, kind)
);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
-- Web Push endpoints. One person may have several — a phone and a laptop.

CREATE TABLE push_subscriptions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL,

  -- The push service URL. Globally unique: the same browser must not register twice,
  -- or every notification is delivered to it twice.
  endpoint         text        NOT NULL UNIQUE,

  -- Web Push encryption material. These are the BROWSER's public key and auth secret —
  -- they let us encrypt to that subscription and are useless for anything else. Still
  -- scoped and deleted with the user.
  p256dh           text        NOT NULL,
  auth             text        NOT NULL,

  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  -- Set when the push service reports the subscription gone (HTTP 404/410). Kept rather
  -- than deleted so a resubscribe can be told apart from a first subscribe.
  expired_at       timestamptz,

  CONSTRAINT push_subscriptions_user_fk
    FOREIGN KEY (user_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX push_subscriptions_user_idx
  ON push_subscriptions (organization_id, user_id)
  WHERE expired_at IS NULL;


-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

CREATE TABLE reports (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- NULL for organisation-level reports; set for a customer's own report.
  customer_id      uuid,

  kind             report_kind   NOT NULL,
  period_start     date          NOT NULL,
  period_end       date          NOT NULL,
  status           report_status NOT NULL DEFAULT 'PENDING',

  -- The COMPUTED FIGURES, frozen at generation time.
  --
  -- A report is a statement about a period that has closed. Recomputing it on every view
  -- would let last week's numbers change — because a customer marked a missed activity
  -- complete, or a consultant edited something — and a "weekly report" whose contents
  -- move is not a report. Storing the result is what makes it one.
  payload          jsonb         NOT NULL DEFAULT '{}'::jsonb,

  generated_at     timestamptz,
  error            text,
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT reports_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT reports_period_ordered CHECK (period_end >= period_start),

  -- A customer report names a customer; an organisation report does not.
  CONSTRAINT reports_subject_shape CHECK (
    (kind IN ('CUSTOMER_WEEKLY', 'CUSTOMER_MONTHLY') AND customer_id IS NOT NULL)
    OR
    (kind IN ('ORGANIZATION_WEEKLY', 'ORGANIZATION_MONTHLY') AND customer_id IS NULL)
  ),

  CONSTRAINT reports_ready_consistency CHECK (
    (status = 'READY') = (generated_at IS NOT NULL)
  )
);

-- One report per subject, kind, and period. The generator is idempotent because of this:
-- a re-run fills gaps rather than producing a second copy of last week.
CREATE UNIQUE INDEX reports_unique_period_idx
  ON reports (organization_id, kind, period_start, COALESCE(customer_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX reports_customer_idx
  ON reports (organization_id, customer_id, period_start DESC);


-- ---------------------------------------------------------------------------
-- media_assets
-- ---------------------------------------------------------------------------
-- METADATA ONLY. The bytes live in ImageKit; this table records what exists, who owns
-- it, and which tenant it belongs to.
--
-- The ImageKit private key never reaches the browser: uploads are authorised
-- server-side, and the client receives a short-lived signature rather than a credential.

CREATE TABLE media_assets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Who uploaded it. NULL once that account is removed; the asset itself survives,
  -- because an exercise illustration outlives the staff member who added it.
  uploaded_by       uuid,

  -- The subject, when the asset is about a person — a progress photo. NULL for library
  -- media. Composite FK, so a photo cannot be attached across a tenant boundary.
  customer_id       uuid,

  file_id           text        NOT NULL UNIQUE,
  url               text        NOT NULL,
  mime_type         text        NOT NULL,
  bytes             bigint      NOT NULL CHECK (bytes > 0),
  width             integer,
  height            integer,

  -- 'exercise' | 'meal' | 'progress_photo' | 'avatar'. Text rather than an enum: this
  -- list will grow with features, and each new value would otherwise need its own
  -- migration before the value could be used (the ALTER TYPE trap in docs/DATABASE.md).
  purpose           text        NOT NULL CHECK (length(trim(purpose)) > 0),

  -- Progress photos are health data and must not be publicly addressable. Signed access
  -- is decided per asset rather than per bucket, so one careless upload cannot make a
  -- whole category public.
  requires_signed_url boolean   NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT media_assets_uploader_fk
    FOREIGN KEY (uploaded_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL,

  CONSTRAINT media_assets_customer_fk
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX media_assets_org_purpose_idx
  ON media_assets (organization_id, purpose, created_at DESC);

CREATE INDEX media_assets_customer_idx
  ON media_assets (organization_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
