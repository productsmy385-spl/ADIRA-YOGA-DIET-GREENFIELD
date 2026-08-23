import type { TenantRoleValue } from "@/server/db/types";

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

export interface NavItem {
  href: string;
  labelKey: string;
  /** Fallback label. i18n keys land with the nav translations. */
  label: string;
}

const CUSTOMER: NavItem[] = [
  { href: "/today", labelKey: "nav.today", label: "Today" },
  { href: "/progress", labelKey: "nav.progress", label: "Progress" },
  { href: "/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
];

const ADMIN: NavItem[] = [
  { href: "/admin", labelKey: "nav.caseload", label: "Caseload" },
  { href: "/admin/yoga", labelKey: "nav.yoga", label: "Yoga" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
];

/** The org owner sees everything an admin does, plus organisation-wide surfaces. */
const ORG_OWNER: NavItem[] = [
  ...ADMIN,
  { href: "/admin/analytics", labelKey: "nav.analytics", label: "Analytics" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
];

export function navItemsForRole(role: TenantRoleValue): NavItem[] {
  switch (role) {
    case "CUSTOMER":
      return CUSTOMER;
    case "ADMIN":
      return ADMIN;
    case "ORG_OWNER":
      return ORG_OWNER;
  }
}

/**
 * The platform console (ADR-001). A separate identity domain entirely — this list is
 * never reachable from a tenant session, and `requirePlatformSession` is what enforces
 * that, not the absence of a link.
 */
export const PLATFORM_NAV: NavItem[] = [
  { href: "/owner", labelKey: "nav.platform", label: "Organisations" },
];
