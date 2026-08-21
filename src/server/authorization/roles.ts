/**
 * Identity domains and the role ladder.
 *
 * Adira has TWO identity domains, and they never mix (decisions/ADR-001):
 *
 *   PLATFORM  — the operator of Adira itself. One role: PLATFORM_OWNER. Spans every
 *               organization. Has its own login surface, its own cookie, and its own
 *               signing secret. A PLATFORM_OWNER has NO organizationId, and that
 *               absence is the boundary: platform accounts live in `owner_accounts`,
 *               tenant accounts live in `users`. They are different tables holding
 *               different kinds of principal, not one table with a flag.
 *
 *   TENANT    — the people inside one wellness organization. Three roles, ranked:
 *               ORG_OWNER > ADMIN > CUSTOMER.
 *
 * ADMIN is the combined admin/consultant role (decisions/ADR-002). It is deliberately
 * NOT org-wide: an ADMIN reaches the customers assigned to them and no others. Org-wide
 * reach is what ORG_OWNER is for. If ADMIN were org-wide, "an admin cannot read an
 * unassigned customer's health record" would have no meaning.
 */

export const IDENTITY_DOMAINS = ["PLATFORM", "TENANT"] as const;
export type IdentityDomain = (typeof IDENTITY_DOMAINS)[number];

export const TENANT_ROLES = ["ORG_OWNER", "ADMIN", "CUSTOMER"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const PLATFORM_ROLES = ["PLATFORM_OWNER"] as const;
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
  CUSTOMER: 10,
  ADMIN: 20,
  ORG_OWNER: 30,
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
  readonly role: TenantRole;
}

export type Actor = PlatformActor | TenantActor;

export function isPlatformActor(actor: Actor): actor is PlatformActor {
  return actor.domain === "PLATFORM";
}

export function isTenantActor(actor: Actor): actor is TenantActor {
  return actor.domain === "TENANT";
}
