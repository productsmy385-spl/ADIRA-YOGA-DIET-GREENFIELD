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
 *   TENANT    — the people inside one wellness organization:
 *               ADMIN > TRAINER > STAFF > USER.
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
 *
 * TRAINER and STAFF exist because that split left something unsayable. Every ADMIN could
 * administer the whole organization; there was no way to describe somebody who works a
 * caseload and administers nothing. Both new roles have `canManageOrganization` false and
 * reach member data only through an assignment, exactly as an ADMIN does:
 *
 *   ADMIN    administers the organization · caseload-scoped data · manages programmes
 *   TRAINER  administers nothing          · caseload-scoped data · manages programmes
 *   STAFF    administers nothing          · caseload-scoped data · no programme authoring
 *   USER     administers nothing          · own data only        · no programme authoring
 *
 * Note that rank does NOT decide any of the columns above. It decides only who may act on
 * and grant roles to whom. Everything else is an explicit permission in `permissions.ts`,
 * because "senior therefore allowed" is how a role quietly acquires a capability nobody
 * granted it.
 */

export const IDENTITY_DOMAINS = ["PLATFORM", "TENANT"] as const;
export type IdentityDomain = (typeof IDENTITY_DOMAINS)[number];

export const TENANT_ROLES = ["ADMIN", "TRAINER", "STAFF", "USER"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/**
 * Roles that can hold a `consultant_assignments` row, and therefore reach a member's
 * health data THROUGH one.
 *
 * Named rather than written inline as `role !== "USER"`, because the two are not the same
 * statement and will diverge. This list answers "could an assignment make this role
 * authorised", which is a question about the caseload model. A future role that
 * administers something without ever carrying a caseload — billing, say — would be
 * excluded here while still not being a USER.
 *
 * Membership grants NOTHING on its own. It only means `canAccessMemberData` will go on to
 * consult the assignment; without one the answer is still NOT_ASSIGNED.
 */
export const CASELOAD_ROLES = ["ADMIN", "TRAINER", "STAFF"] as const;

export function carriesCaseload(role: TenantRole): boolean {
  return (CASELOAD_ROLES as readonly string[]).includes(role);
}

/**
 * Where a role lands after signing in, and where an unauthorised route sends them.
 *
 * Every tenant role must appear here. It is a total `Record`, not a lookup with a
 * fallback, so adding a role to `TenantRole` without deciding where it lives is a
 * compile error rather than a silent redirect to the customer dashboard — which is what
 * a TRAINER used to get from `requireRole`, landing them on a page built for members.
 */
const HOME_PATH: Record<TenantRole, string> = {
  ADMIN: "/admin",
  TRAINER: "/trainer",
  STAFF: "/staff",
  USER: "/dashboard",
};

export function homePathForRole(role: TenantRole): string {
  return HOME_PATH[role];
}

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
  /*
   * STAFF and TRAINER occupy the gap this table was built with.
   *
   * ADR-002 closed by naming this exact change: "If the four-role model is later wanted,
   * `ADMIN` splits into two: add `CONSULTANT` at rank 15 and give `ADMIN` org-wide
   * reach." ADR-013 did the second half. TRAINER at 15 is the first half, arriving late
   * and at the rank the ADR specified.
   *
   * The ordering is what makes the rank rules produce the required grant matrix without a
   * line of new escalation logic: `canAssignRole` demands the actor STRICTLY outrank the
   * role, so ADMIN (20) grants TRAINER, STAFF and USER but never ADMIN, and TRAINER (15)
   * grants nothing at all unless a permission explicitly says so.
   */
  STAFF: 12,
  TRAINER: 15,
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
