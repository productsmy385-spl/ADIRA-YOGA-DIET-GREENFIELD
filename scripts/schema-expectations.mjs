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
  tenant_role: ["ORG_OWNER", "ADMIN", "CUSTOMER"],
  account_status: ["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "LOCKED", "DISABLED"],
  organization_status: ["ACTIVE", "SUSPENDED", "CLOSED"],
  job_status: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"],
  otp_purpose: ["ACCOUNT_ACTIVATION", "ACCOUNT_RECOVERY", "NEW_DEVICE", "STEP_UP"],
  otp_status: ["PENDING", "VERIFIED", "EXPIRED", "EXHAUSTED", "SUPERSEDED"],
};
