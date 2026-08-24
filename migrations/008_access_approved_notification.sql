-- 008_access_approved_notification.sql
--
-- One enum value, so an approved applicant can be told.
--
-- Additive and safe under Railway's migrate-before-new-container deploy: nothing reads
-- this label until the application that knows about it is serving. As with 006's 'USER',
-- the value is ADDED here and USED only by code running after this transaction commits —
-- PostgreSQL forbids using a label in the transaction that adds it (CLAUDE.md invariant 6).
--
-- WHY A NEW KIND RATHER THAN REUSING ONE
--
-- The existing kinds are all about a practice already under way: reminders, missed
-- activities, plan changes, reports. "Your request to join was approved" is the one
-- notification that arrives before the person is a member at all, and it is the only one
-- whose recipient cannot yet sign in to read it. Giving it its own kind means its channel
-- defaults and its wording can differ without disturbing the others.

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'ACCESS_APPROVED';
