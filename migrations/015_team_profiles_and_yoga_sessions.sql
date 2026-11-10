-- 015 — Team profiles and scheduled yoga sessions (platform upgrade brief §7–8).
--
-- ADDITIVE. Three nullable profile columns on `users`, two new tables. Nothing existing
-- changes.
--
-- Member data rule (ADR-013/016) is carried into the schema the same way as everywhere
-- else: every participant and instructor reference is a COMPOSITE key on
-- (id, organization_id), so a session cannot name a person from another organisation.
-- WHO may see a participant's attendance is decided by `canAccessMemberData` in the
-- service, exactly as for activities.

-- ── team profiles ──────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN specialisation text CHECK (specialisation IS NULL OR length(specialisation) <= 200),
  ADD COLUMN qualifications text CHECK (qualifications IS NULL OR length(qualifications) <= 300),
  ADD COLUMN bio            text CHECK (bio IS NULL OR length(bio) <= 600);

-- ── yoga sessions ──────────────────────────────────────────────────────────
CREATE TABLE yoga_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            text        NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  starts_at        timestamptz NOT NULL,
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  instructor_id    uuid        NOT NULL,
  status           text        NOT NULL DEFAULT 'SCHEDULED'
                               CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  notes            text        CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yoga_sessions_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT yoga_sessions_instructor_fk
    FOREIGN KEY (instructor_id, organization_id) REFERENCES users (id, organization_id),
  CONSTRAINT yoga_sessions_created_by_fk
    FOREIGN KEY (created_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL (created_by)
);

CREATE TRIGGER yoga_sessions_updated_at
  BEFORE UPDATE ON yoga_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX yoga_sessions_org_time_idx ON yoga_sessions (organization_id, starts_at);
CREATE INDEX yoga_sessions_instructor_idx ON yoga_sessions (organization_id, instructor_id, starts_at);

CREATE TABLE yoga_session_participants (
  session_id       uuid        NOT NULL,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id        uuid        NOT NULL,
  attendance       text        NOT NULL DEFAULT 'EXPECTED'
                               CHECK (attendance IN ('EXPECTED', 'ATTENDED', 'ABSENT', 'EXCUSED')),
  marked_at        timestamptz,
  marked_by        uuid,
  added_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (session_id, member_id),
  -- The session and the member must both belong to THIS organisation.
  CONSTRAINT yoga_session_participants_session_fk
    FOREIGN KEY (session_id, organization_id)
    REFERENCES yoga_sessions (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT yoga_session_participants_member_fk
    FOREIGN KEY (member_id, organization_id)
    REFERENCES users (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT yoga_session_participants_marked_by_fk
    FOREIGN KEY (marked_by, organization_id)
    REFERENCES users (id, organization_id) ON DELETE SET NULL (marked_by)
);

CREATE INDEX yoga_session_participants_member_idx
  ON yoga_session_participants (organization_id, member_id);
