
/**
 * Which navigation items each role sees.
 *
 * ⚠️ THIS IS USABILITY, NOT AUTHORIZATION.
 *
 * Hiding a link grants nothing and protects nothing. Every route keeps its server-side
 * guard (`requireRole`, `canViewCustomer`) and every repository call keeps its
 * `organizationId`. A user who types a URL they should not reach still gets the same
 * redirect or 404 they get today — `nav-items.test.ts` asserts that this file cannot be
 * mistaken for a permission system.
 *
 * Kept as pure data, separate from any component, precisely so it is testable and so it
 * is obvious that nothing here runs on a request.
 */

/**
 * The roles this module renders for.
 *
 * Deliberately a LOCAL union rather than the server's role type. Two reasons:
 *
 *  1. Navigation is presentation. Importing the authorization type would couple a menu to
 *     the security model and invite the idea that changing one changes the other.
 *  2. The role model is mid-migration (ADR-013). Accepting both the merged labels and the
 *     legacy ones means the menu keeps working across the deployment where the database
 *     still holds ORG_OWNER and CUSTOMER rows — without this file inventing any policy
 *     about what those roles may do.
 */
export type NavRole = "ADMIN" | "USER" | "ORG_OWNER" | "CUSTOMER";

export interface NavItem {
  href: string;
  labelKey: string;
  /** Fallback label. i18n keys land with the nav translations. */
  label: string;
}

const MEMBER: NavItem[] = [
  { href: "/today", labelKey: "nav.today", label: "Today" },
  { href: "/progress", labelKey: "nav.progress", label: "Progress" },
  { href: "/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
];

/**
 * One admin menu after the merge (ADR-013).
 *
 * Analytics and Members are ADMINISTRATIVE surfaces, so every admin gets them — that is
 * the half of the merge that genuinely widens. Caseload remains assignment-scoped by its
 * query, not by being hidden from the menu: navigation is presentation and enforces
 * nothing.
 */
const ADMIN: NavItem[] = [
  { href: "/admin", labelKey: "nav.caseload", label: "Caseload" },
  { href: "/admin/access-requests", labelKey: "nav.requests", label: "Requests" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Programmes" },
  { href: "/admin/yoga", labelKey: "nav.yoga", label: "Yoga" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/admin/analytics", labelKey: "nav.analytics", label: "Analytics" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
];

export function navItemsForRole(role: NavRole): NavItem[] {
  switch (role) {
    case "USER":
    case "CUSTOMER":
      return MEMBER;
    case "ADMIN":
    case "ORG_OWNER":
      return ADMIN;
  }
}

/**
 * The platform console (ADR-001). A separate identity domain entirely — this list is
 * never reachable from a tenant session, and `requirePlatformSession` is what enforces
 * that, not the absence of a link.
 */
export const PLATFORM_NAV: NavItem[] = [
  { href: "/super-admin", labelKey: "nav.platform", label: "Organisations" },
];
