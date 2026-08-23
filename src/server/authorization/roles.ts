/**
 * Identity domains and the role ladder.
 *
 * Adira has TWO identity domains, and they never mix (decisions/ADR-001):
 *
 *   PLATFORM  — the operator of Adira itself. One role: SUPER_ADMIN. Spans every
 *               organization. Has its own login surface, its own cookie, and its own
 *               signing secret. A SUPER_ADMIN has NO organizationId, and that absence is
 *               the boundary: platform accounts live in `owner_accounts`, tenant accounts
 *               live in `users`. They are different tables holding different kinds of
 *               principal, not one table with a flag.
 *
 *   TENANT    — the people inside one wellness organization. Two roles: ADMIN > USER.
 *
 * ADR-013 merged the former ORG_OWNER and ADMIN into a single ADMIN. The rule that
 * survived that merge is the important one:
 *
 *   **Administrative reach is organization-wide. Member health and activity data access
 *   remains assignment-scoped.**
 *
 * An ADMIN may administer every member of their organization and may read the health data
 * of only those assigned to them. Those are two different questions and
 * `permissions.ts` answers them with two different functions, deliberately — a single
 * boolean is what let the two be conflated in the first place.
 */

export const IDENTITY_DOMAINS = ["PLATFORM", "TENANT"] as const;
export type IdentityDomain = (typeof IDENTITY_DOMAINS)[number];

export const TENANT_ROLES = ["ADMIN", "USER"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/**
 * Role labels still present in the database during the ADR-013 migration window.
 *
 * `tenant_role` is a PostgreSQL enum and PostgreSQL cannot remove a value from one, so
 * these labels outlive the code that used them. More importantly, migration 006 lands
 * *before* the backfill: for one deployment the database holds ORG_OWNER and CUSTOMER
 * rows while this code is already running. Reading both is not defensive programming, it
 * is the requirement.
 *
 * Removed only when nothing in production stores them — see ADR-013, deployment 3.
 */
export const LEGACY_TENANT_ROLES = ["ORG_OWNER", "CUSTOMER"] as const;
export type LegacyTenantRole = (typeof LEGACY_TENANT_ROLES)[number];

/** What a `users.role` column may actually contain right now. */
export type StoredTenantRole = TenantRole | LegacyTenantRole;

export function isLegacyTenantRole(value: string): value is LegacyTenantRole {
  return (LEGACY_TENANT_ROLES as readonly string[]).includes(value);
}

/**
 * Map whatever the database holds onto the two-role model the application reasons about.
 *
 * ORG_OWNER becomes ADMIN and CUSTOMER becomes USER, so every call site above this line
 * sees only the merged model and no `if (role === "ORG_OWNER")` survives in business
 * logic. The one place the distinction still matters is transitional *data* reach, and
 * that reads `storedRole` explicitly rather than inferring it from `role` — see
 * `isLegacyOrganizationOwner`.
 */
export function normaliseRole(stored: StoredTenantRole): TenantRole {
  if (stored === "ORG_OWNER") return "ADMIN";
  if (stored === "CUSTOMER") return "USER";
  return stored;
}

export const PLATFORM_ROLES = ["SUPER_ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type Role = TenantRole | PlatformRole;

/**
 * Seniority on the tenant ladder.
 *
 * Gaps of 10 leave room to insert a role later without renumbering every comparison.
 * Only relative order is ever read; the absolute numbers carry no meaning and must not
 * be persisted — the database stores the role name, never the rank.
 */
const TENANT_RANK: Record<TenantRole, number> = {
  USER: 10,
  ADMIN: 20,
};

export function rankOf(role: TenantRole): number {
  return TENANT_RANK[role];
}

/** A principal authenticated in the platform domain. Never scoped to an organization. */
export interface PlatformActor {
  readonly domain: "PLATFORM";
  readonly accountId: string;
  readonly role: PlatformRole;
}

/**
 * A principal authenticated in the tenant domain.
 *
 * `organizationId` is populated from the session row, never from a request parameter.
 * That is the whole of the multi-tenancy guarantee (ADR-004): if a caller can influence
 * this value, every scoping check below becomes decorative.
 */
export interface TenantActor {
  readonly domain: "TENANT";
  readonly userId: string;
  readonly organizationId: string;
  /** Always the merged model. Legacy labels are normalised before they reach here. */
  readonly role: TenantRole;
  /**
   * The raw value from `users.role`, when it differs from `role`.
   *
   * Exists for exactly one reason, and only until ADR-013's deployment 3: a pre-migration
   * ORG_OWNER genuinely had organization-wide reach over member data, and stripping that
   * the moment this code deploys — before migration 007 seeds their assignments — would
   * lock the only real administrator out of their own organization. Reading `storedRole`
   * keeps that grandfathered access explicit and greppable rather than hiding it inside a
   * role comparison.
   */
  readonly storedRole?: StoredTenantRole;
}

export type Actor = PlatformActor | TenantActor;

export function isPlatformActor(actor: Actor): actor is PlatformActor {
  return actor.domain === "PLATFORM";
}

export function isTenantActor(actor: Actor): actor is TenantActor {
  return actor.domain === "TENANT";
}

/**
 * Is this actor a pre-migration ORG_OWNER whose organization-wide data reach is
 * grandfathered?
 *
 * TRANSITIONAL. Returns false for every account created or migrated under ADR-013, and is
 * deleted with deployment 3. It is a named function rather than an inline comparison so
 * that removing it is a compiler-checked exercise instead of a search-and-hope.
 */
export function isLegacyOrganizationOwner(actor: Actor): boolean {
  return isTenantActor(actor) && actor.storedRole === "ORG_OWNER";
}
