/**
 * What the applied schema is expected to contain, in plain JavaScript.
 *
 * This exists because `scripts/` runs under bare Node and cannot import the TypeScript
 * mirrors in `src/server/db/types.ts`. Two copies of the same list is exactly the drift
 * this project already guards against elsewhere, so the copies are held together by
 * `src/server/db/types.test.ts`, which fails if they disagree.
 *
 * That gives three layers, each catching what the one below cannot:
 *
 *   types.test.ts        TS mirror  vs  this file        — no database needed
 *   enum-parity.test.ts  TS mirror  vs  live pg_enum     — needs a database
 *   verify-schema.mjs    this file  vs  live pg_enum     — Phase 1 acceptance
 *
 * When a migration changes an enum, update `types.ts` AND this file in the same change.
 */

export const PG_ENUM_EXPECTATIONS = {
  identity_domain: ["PLATFORM", "TENANT"],
  /*
   * Six labels, in declaration order.
   *
   * ORG_OWNER, ADMIN, CUSTOMER shipped with 001; USER was added by migration 006 when
   * ADR-013 merged the model — PostgreSQL cannot drop an enum value, so the two merged-away
   * labels remain as tombstones. TRAINER and STAFF were added by migration 011, completing
   * the four-role ladder ADR-002 anticipated.
   *
   * This is the THIRD representation of the same enum, alongside `TENANT_ROLE_VALUES` in
   * types.ts and `pg_enum` itself, and `db/types.test.ts` asserts all three agree. That is
   * why a migration must update this file in the same change: the test is the only thing
   * that notices, and it noticed this one.
   */
  tenant_role: ["ORG_OWNER", "ADMIN", "CUSTOMER", "USER", "TRAINER", "STAFF"],
  access_request_status: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  account_status: ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "LOCKED", "DISABLED"],
  organization_status: ["ACTIVE", "SUSPENDED", "CLOSED"],
  job_status: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"],
  otp_purpose: ["ACCOUNT_ACTIVATION", "ACCOUNT_RECOVERY", "NEW_DEVICE", "STEP_UP"],
  otp_status: ["PENDING", "VERIFIED", "EXPIRED", "EXHAUSTED", "SUPERSEDED"],
  webauthn_ceremony: ["REGISTRATION", "AUTHENTICATION"],
  programme_kind: ["YOGA", "DIET"],
  difficulty_level: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
  meal_slot: ["BREAKFAST", "LUNCH", "SNACK", "DINNER"],
  assignment_status: ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"],
  activity_status: [
    "PENDING",
    "STARTED",
    "COMPLETED",
    "SKIPPED",
    "MISSED",
    "REVIEW_REQUIRED",
  ],
  notification_channel: ['IN_APP', 'PUSH', 'EMAIL'],
  notification_kind: [
    'YOGA_REMINDER','DIET_REMINDER','ACTIVITY_REMINDER','MISSED_ACTIVITY',
    'PLAN_UPDATED','CONSULTANT_MESSAGE','REPORT_READY','APPOINTMENT_REMINDER',
    'WEEKLY_PROGRESS',
    "ACCESS_APPROVED",
    // Scheduled greetings (migration 010).
    "BIRTHDAY",
    "ANNIVERSARY",
    "FESTIVAL",
  ],
  report_kind: ['CUSTOMER_WEEKLY','CUSTOMER_MONTHLY','ORGANIZATION_WEEKLY','ORGANIZATION_MONTHLY'],
  report_status: ['PENDING','READY','FAILED'],
};
