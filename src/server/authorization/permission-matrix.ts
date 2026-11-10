import type { TenantRole } from "./roles";

/**
 * The permission matrix (ADR-016) — THE single source of truth for what each tenant role
 * may do. The capability functions in `permissions.ts` read this; nothing else names a
 * role to decide a capability.
 *
 * Two things this matrix deliberately does NOT decide:
 *   1. WHICH member's data. `members.view` is the roster; reading a member's practice is
 *      `canAccessMemberData`, which always also requires an assignment (ADR-013).
 *   2. Rank. `team.assign_roles` lets a role grant roles at all; `canAssignRole` still
 *      requires it to strictly outrank the role being granted.
 *
 * Changing a row here changes production authorization. `permission-matrix.test.ts` pins
 * every row so that cannot happen by accident.
 */

export const PERMISSIONS = [
  "tenant.view",
  "tenant.update",
  "tenant.manage_settings",
  "website.view",
  "website.edit",
  "website.publish",
  "website.manage_templates",
  "website.manage_branding",
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "members.assign",
  "yoga.view",
  "yoga.create",
  "yoga.update",
  "yoga.delete",
  "yoga.assign",
  "yoga.manage_sessions",
  "diet.view",
  "diet.create",
  "diet.update",
  "diet.assign",
  "team.view",
  "team.invite",
  "team.update",
  "team.remove",
  "team.assign_roles",
  "reports.view",
  "reports.export",
  "settings.view",
  "settings.update",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const YOGA_ALL: Permission[] = ["yoga.view", "yoga.create", "yoga.update", "yoga.delete", "yoga.assign", "yoga.manage_sessions"];
const DIET_ALL: Permission[] = ["diet.view", "diet.create", "diet.update", "diet.assign"];
const MEMBERS_ALL: Permission[] = ["members.view", "members.create", "members.update", "members.delete", "members.assign"];
const TEAM_ALL: Permission[] = ["team.view", "team.invite", "team.update", "team.remove", "team.assign_roles"];

export const ROLE_PERMISSIONS: Record<TenantRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),

  TEAM_MANAGER: new Set<Permission>([
    "tenant.view",
    "settings.view",
    ...MEMBERS_ALL,
    ...TEAM_ALL,
    "yoga.view",
    "diet.view",
    "reports.view",
    "reports.export",
  ]),

  // Yoga Instructor. Authors and prescribes both libraries, as TRAINER always has.
  TRAINER: new Set<Permission>([...YOGA_ALL, ...DIET_ALL, "reports.view"]),

  // Diet only — the library, programmes and prescribing. No yoga at all.
  DIETITIAN: new Set<Permission>([...DIET_ALL, "reports.view"]),

  STAFF: new Set<Permission>(["reports.view"]),

  USER: new Set<Permission>(),
};

export function roleHasPermission(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
