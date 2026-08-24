-- 010_occasions.sql
--
-- Birthdays, wedding anniversaries, and organisation festivals.
--
-- WHY DATES ON `users` AND FESTIVALS IN THEIR OWN TABLE
--
-- A birthday belongs to a person and there is exactly one, so it is a column. A festival
-- belongs to the organisation, there are many, and which ones matter differs between a
-- studio in Hyderabad and one in Chennai — so it is a table the organisation fills in
-- rather than a list this migration invents. Hardcoding "Diwali, Christmas" would be this
-- codebase deciding which festivals its customers observe.
--
-- WHY THE DATES ARE NULLABLE AND UNVERIFIED
--
-- Nobody is required to give a birth date to follow a yoga plan. A NOT NULL column would
-- force staff to invent one at member creation, which is worse than not knowing: an
-- invented date produces a greeting on the wrong day, and the member cannot tell it was
-- guessed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS wedding_anniversary date;

COMMENT ON COLUMN users.date_of_birth IS
  'Optional. Drives BIRTHDAY notifications (migration 010). Never required to use the product.';

-- Finding "whose birthday is today" without scanning every user. The expression index
-- matches the (month, day) comparison the nightly job makes, since the YEAR must be
-- ignored — a birthday recurs and a date column does not.
CREATE INDEX IF NOT EXISTS users_birthday_idx
  ON users (organization_id, (EXTRACT(MONTH FROM date_of_birth)), (EXTRACT(DAY FROM date_of_birth)))
  WHERE date_of_birth IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_anniversary_idx
  ON users (organization_id, (EXTRACT(MONTH FROM wedding_anniversary)), (EXTRACT(DAY FROM wedding_anniversary)))
  WHERE wedding_anniversary IS NOT NULL;


-- ---------------------------------------------------------------------------
-- organization_festivals
-- ---------------------------------------------------------------------------
-- Each organisation states which occasions it marks. `observed_on` is a real date because
-- most Indian festivals move against the Gregorian calendar — Diwali is not a fixed
-- day/month pair, so storing (month, day) would be wrong every year but one.
--
-- A recurring festival is therefore several rows, one per year. That is deliberate: it
-- makes "which date did we greet people on in 2027" answerable, and it means nothing has
-- to compute a lunar calendar.

CREATE TABLE IF NOT EXISTS organization_festivals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name             text        NOT NULL CHECK (length(trim(name)) > 0),
  observed_on      date        NOT NULL,
  greeting         text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- One greeting per festival per organisation per day.
  CONSTRAINT organization_festivals_unique UNIQUE (organization_id, name, observed_on)
);

CREATE INDEX IF NOT EXISTS organization_festivals_due_idx
  ON organization_festivals (observed_on, organization_id);

CREATE TRIGGER organization_festivals_set_updated_at
  BEFORE UPDATE ON organization_festivals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Idempotency for scheduled greetings
-- ---------------------------------------------------------------------------
-- The nightly job may run more than once — a retry, an overlapping invocation, a manual
-- trigger. Without a uniqueness rule a member gets three birthday messages, which is worse
-- than none: it is visibly broken in a way that reaches the customer.
--
-- `occasion_key` is a stable identity for "this greeting, this recipient, this day", set
-- only on scheduled notifications. Everything else leaves it NULL and the partial unique
-- index ignores them.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS occasion_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_occasion_once_idx
  ON notifications (recipient_id, occasion_key)
  WHERE occasion_key IS NOT NULL;

COMMENT ON COLUMN notifications.occasion_key IS
  'e.g. BIRTHDAY:2026-08-24. Makes the nightly greeting job idempotent (migration 010).';


-- New notification kinds. ADDED here, USED by code running after this commits — the same
-- enum/transaction rule as 006 and 008 (CLAUDE.md invariant 6).
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'BIRTHDAY';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'ANNIVERSARY';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'FESTIVAL';
