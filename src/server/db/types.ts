/**
 * TypeScript mirrors of the PostgreSQL enum types.
 *
 * These unions are hand-maintained. That is a known hazard, not an oversight: TaskFlow
 * HR's Knowledge Base records `UserStatus` missing `LOCKED` for the entire life of one
 * migration while the auth adapter was already casting to `'LOCKED'::user_status`.
 *
 * Two things keep this file honest:
 *
 *  1. `enum-parity.test.ts` reads `pg_enum` from a live database and fails if any union
 *     here disagrees with the type there. It is skipped when no test database is
 *     configured, so it protects CI and anyone with a database, and silently steps
 *     aside for a contributor who has neither.
 *
 *  2. Exhaustive `Record<Enum, …>` maps elsewhere in the codebase turn a missed value
 *     into a compile error. Do not weaken those to `Partial<Record<…>>` to make a build
 *     pass — that disables the safety net rather than fixing the drift.
 *
 * RULE: when a migration touches an enum, update this file in the same change.
 */

/** `identity_domain` — see decisions/ADR-001. */
export const IDENTITY_DOMAIN_VALUES = ["PLATFORM", "TENANT"] as const;
export type IdentityDomainValue = (typeof IDENTITY_DOMAIN_VALUES)[number];

/** `tenant_role` — the ladder inside one organization. */
export const TENANT_ROLE_VALUES = ["ORG_OWNER", "ADMIN", "CUSTOMER"] as const;
export type TenantRoleValue = (typeof TENANT_ROLE_VALUES)[number];

/** `account_status` — governs whether a principal may hold a session at all. */
export const ACCOUNT_STATUS_VALUES = [
  "INVITED",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "LOCKED",
  "DISABLED",
] as const;
export type AccountStatusValue = (typeof ACCOUNT_STATUS_VALUES)[number];

/** `organization_status`. */
export const ORGANIZATION_STATUS_VALUES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type OrganizationStatusValue = (typeof ORGANIZATION_STATUS_VALUES)[number];

/** `otp_purpose` — why a code was issued; governs expiry and what verifying it permits. */
export const OTP_PURPOSE_VALUES = [
  "ACCOUNT_ACTIVATION",
  "ACCOUNT_RECOVERY",
  "NEW_DEVICE",
  "STEP_UP",
] as const;
export type OtpPurposeValue = (typeof OTP_PURPOSE_VALUES)[number];

/** `otp_status`. */
export const OTP_STATUS_VALUES = [
  "PENDING",
  "VERIFIED",
  "EXPIRED",
  "EXHAUSTED",
  "SUPERSEDED",
] as const;
export type OtpStatusValue = (typeof OTP_STATUS_VALUES)[number];

/** `job_status` — the async queue drained by Railway Cron (decisions/ADR-003). */
export const JOB_STATUS_VALUES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD",
] as const;
export type JobStatusValue = (typeof JOB_STATUS_VALUES)[number];

/**
 * Every enum in the schema, keyed by its PostgreSQL type name.
 * `enum-parity.test.ts` iterates this map — adding an entry here is what puts a new
 * enum under drift protection.
 */
export const PG_ENUMS = {
  identity_domain: IDENTITY_DOMAIN_VALUES,
  tenant_role: TENANT_ROLE_VALUES,
  account_status: ACCOUNT_STATUS_VALUES,
  organization_status: ORGANIZATION_STATUS_VALUES,
  job_status: JOB_STATUS_VALUES,
  otp_purpose: OTP_PURPOSE_VALUES,
  otp_status: OTP_STATUS_VALUES,
} as const satisfies Record<string, readonly string[]>;
