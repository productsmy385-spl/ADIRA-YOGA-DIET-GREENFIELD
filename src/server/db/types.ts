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
/**
 * Every label `tenant_role` accepts, in the order the enum declares them.
 *
 * Four, not two. ADR-013 merged the model to ADMIN | USER, but PostgreSQL cannot remove an
 * enum value, so ORG_OWNER and CUSTOMER remain accepted until (and unless) deployment 3
 * recreates the type. This constant mirrors the DATABASE; the application's own two-role
 * model lives in `src/server/authorization/roles.ts` and is reached through `normaliseRole`.
 */
export const TENANT_ROLE_VALUES = ["ORG_OWNER", "ADMIN", "CUSTOMER", "USER"] as const;
export type TenantRoleValue = (typeof TENANT_ROLE_VALUES)[number];

/** `access_request_status` — separate from account status, deliberately (ADR-013). */
export const ACCESS_REQUEST_STATUS_VALUES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type AccessRequestStatusValue = (typeof ACCESS_REQUEST_STATUS_VALUES)[number];

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

/** `webauthn_ceremony` — which half of a passkey flow a challenge belongs to. */
export const WEBAUTHN_CEREMONY_VALUES = ["REGISTRATION", "AUTHENTICATION"] as const;
export type WebauthnCeremonyValue = (typeof WEBAUTHN_CEREMONY_VALUES)[number];

/** `programme_kind` — yoga or diet. */
export const PROGRAMME_KIND_VALUES = ["YOGA", "DIET"] as const;
export type ProgrammeKindValue = (typeof PROGRAMME_KIND_VALUES)[number];

export const DIFFICULTY_LEVEL_VALUES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type DifficultyLevelValue = (typeof DIFFICULTY_LEVEL_VALUES)[number];

export const MEAL_SLOT_VALUES = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"] as const;
export type MealSlotValue = (typeof MEAL_SLOT_VALUES)[number];

export const ASSIGNMENT_STATUS_VALUES = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type AssignmentStatusValue = (typeof ASSIGNMENT_STATUS_VALUES)[number];

/** `activity_status` — §16. REVIEW_REQUIRED is excluded from adherence entirely. */
export const ACTIVITY_STATUS_VALUES = [
  "PENDING",
  "STARTED",
  "COMPLETED",
  "SKIPPED",
  "MISSED",
  "REVIEW_REQUIRED",
] as const;
export type ActivityStatusValue = (typeof ACTIVITY_STATUS_VALUES)[number];

/** `notification_channel` — §19. */
export const NOTIFICATION_CHANNEL_VALUES = ["IN_APP", "PUSH", "EMAIL"] as const;
export type NotificationChannelValue = (typeof NOTIFICATION_CHANNEL_VALUES)[number];

/** `notification_kind` — a REASON, not a template; wording lives in the message. */
export const NOTIFICATION_KIND_VALUES = [
  "YOGA_REMINDER",
  "DIET_REMINDER",
  "ACTIVITY_REMINDER",
  "MISSED_ACTIVITY",
  "PLAN_UPDATED",
  "CONSULTANT_MESSAGE",
  "REPORT_READY",
  "APPOINTMENT_REMINDER",
  "WEEKLY_PROGRESS",
] as const;
export type NotificationKindValue = (typeof NOTIFICATION_KIND_VALUES)[number];

export const REPORT_KIND_VALUES = [
  "CUSTOMER_WEEKLY",
  "CUSTOMER_MONTHLY",
  "ORGANIZATION_WEEKLY",
  "ORGANIZATION_MONTHLY",
] as const;
export type ReportKindValue = (typeof REPORT_KIND_VALUES)[number];

export const REPORT_STATUS_VALUES = ["PENDING", "READY", "FAILED"] as const;
export type ReportStatusValue = (typeof REPORT_STATUS_VALUES)[number];

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
  access_request_status: ACCESS_REQUEST_STATUS_VALUES,
  account_status: ACCOUNT_STATUS_VALUES,
  organization_status: ORGANIZATION_STATUS_VALUES,
  job_status: JOB_STATUS_VALUES,
  otp_purpose: OTP_PURPOSE_VALUES,
  otp_status: OTP_STATUS_VALUES,
  webauthn_ceremony: WEBAUTHN_CEREMONY_VALUES,
  programme_kind: PROGRAMME_KIND_VALUES,
  difficulty_level: DIFFICULTY_LEVEL_VALUES,
  meal_slot: MEAL_SLOT_VALUES,
  assignment_status: ASSIGNMENT_STATUS_VALUES,
  activity_status: ACTIVITY_STATUS_VALUES,
  notification_channel: NOTIFICATION_CHANNEL_VALUES,
  notification_kind: NOTIFICATION_KIND_VALUES,
  report_kind: REPORT_KIND_VALUES,
  report_status: REPORT_STATUS_VALUES,
} as const satisfies Record<string, readonly string[]>;
