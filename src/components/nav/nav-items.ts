
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
export type NavRole =
  | "ADMIN"
  | "TEAM_MANAGER"
  | "TRAINER"
  | "DIETITIAN"
  | "STAFF"
  | "USER"
  | "ORG_OWNER"
  | "CUSTOMER";

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
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

/**
 * What the mobile tab bar shows — a SUBSET, not the whole menu.
 *
 * A phone tab bar holds four or five destinations before the labels stop being readable
 * and the targets stop being reliably tappable. The admin menu has nine items; putting
 * them all in a bottom bar produces a row of illegible 40px columns, which is worse than
 * a shorter bar plus the full menu one tap away.
 *
 * So `primaryNavForRole` answers a different question from `navItemsForRole`: not "what
 * may this person reach" but "what do they reach most". Everything else stays available
 * in the desktop bar and by URL. As with the rest of this file, it grants nothing —
 * hiding a link is not authorization.
 */
const MEMBER_PRIMARY: NavItem[] = MEMBER;

const ADMIN_PRIMARY: NavItem[] = [
  { href: "/admin", labelKey: "nav.caseload", label: "Caseload" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Plans" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Alerts" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

/**
 * TRAINER — a caseload and the plans for it, and no organization administration.
 *
 * Deliberately has no Members entry. `/admin/members` is the organization-wide roster and
 * is gated by `canManageOrganization`, which returns false for this role; linking to it
 * would offer a redirect rather than a destination. The trainer's people are on their own
 * dashboard, which is scoped by assignment in SQL.
 */
const TRAINER: NavItem[] = [
  { href: "/trainer", labelKey: "nav.caseload", label: "My customers" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Programmes" },
  { href: "/admin/yoga", labelKey: "nav.yoga", label: "Yoga" },
  { href: "/admin/sessions", labelKey: "nav.sessions", label: "Sessions" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

const TRAINER_PRIMARY: NavItem[] = [
  { href: "/trainer", labelKey: "nav.caseload", label: "Customers" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Plans" },
  { href: "/admin/yoga", labelKey: "nav.yoga", label: "Yoga" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Alerts" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

/**
 * STAFF — watch a caseload, nothing else.
 *
 * No library, no programmes, no members. `canManageProgrammes` denies this role, so a
 * Yoga or Programmes link would be a link to a refusal. What remains is genuinely what
 * the role can do: see the people assigned to them, see what those people are meant to be
 * doing, and message them.
 */
const STAFF: NavItem[] = [
  { href: "/staff", labelKey: "nav.caseload", label: "Customers" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

const STAFF_PRIMARY: NavItem[] = STAFF;

/**
 * TEAM_MANAGER (ADR-016) — the roster and the team, never settings, website or libraries.
 * Each destination is one `canManageMembers` / `canManageTeam` admits.
 */
const TEAM_MANAGER: NavItem[] = [
  { href: "/admin/team", labelKey: "nav.team", label: "Team" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
  { href: "/admin/access-requests", labelKey: "nav.requests", label: "Requests" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/admin/analytics", labelKey: "nav.analytics", label: "Analytics" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

const TEAM_MANAGER_PRIMARY: NavItem[] = [
  { href: "/admin/team", labelKey: "nav.team", label: "Team" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
  { href: "/admin/access-requests", labelKey: "nav.requests", label: "Requests" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Alerts" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

/** DIETITIAN (ADR-016) — an assigned caseload and the diet library. No yoga. */
const DIETITIAN: NavItem[] = [
  { href: "/trainer", labelKey: "nav.caseload", label: "My customers" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Programmes" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

const DIETITIAN_PRIMARY: NavItem[] = [
  { href: "/trainer", labelKey: "nav.caseload", label: "Customers" },
  { href: "/admin/programmes", labelKey: "nav.programmes", label: "Plans" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/notifications", labelKey: "nav.notifications", label: "Alerts" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
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
  { href: "/admin/sessions", labelKey: "nav.sessions", label: "Sessions" },
  { href: "/admin/diet", labelKey: "nav.diet", label: "Diet" },
  { href: "/admin/reports", labelKey: "nav.reports", label: "Reports" },
  { href: "/admin/analytics", labelKey: "nav.analytics", label: "Analytics" },
  { href: "/admin/members", labelKey: "nav.members", label: "Members" },
  { href: "/admin/team", labelKey: "nav.team", label: "Team" },
  { href: "/admin/website", labelKey: "nav.website", label: "Website" },
  /*
   * Admins receive notifications too — `listNotifications` is keyed by recipient, not by
   * role, and `/notifications` is guarded by `requireTenantSession` rather than a member
   * role. The page was simply not linked from the admin menu, so an admin's own
   * notifications accumulated somewhere they had no route to.
   */
  { href: "/notifications", labelKey: "nav.notifications", label: "Notifications" },
  { href: "/profile", labelKey: "nav.profile", label: "Profile" },
];

export function navItemsForRole(role: NavRole): NavItem[] {
  switch (role) {
    case "USER":
    case "CUSTOMER":
      return MEMBER;
    case "TRAINER":
      return TRAINER;
    case "DIETITIAN":
      return DIETITIAN;
    case "TEAM_MANAGER":
      return TEAM_MANAGER;
    case "STAFF":
      return STAFF;
    case "ADMIN":
    case "ORG_OWNER":
      return ADMIN;
  }
}

/**
 * Where the brand mark takes each role — its own landing page.
 *
 * The logo used to send every non-member to `/admin`, which TRAINER and STAFF cannot
 * enter (`canManageOrganization` is false for both), so clicking the logo bounced them.
 * Matches the server's `homePathForRole` for staff roles. Members differ on purpose: the
 * server lands them on `/dashboard` after sign-in, while the member menu's home has always
 * been `/today`, their daily practice — unchanged here.
 */
export function homeForRole(role: NavRole): string {
  switch (role) {
    case "USER":
    case "CUSTOMER":
      return "/today";
    case "TRAINER":
    case "DIETITIAN":
      return "/trainer";
    case "TEAM_MANAGER":
      return "/admin/team";
    case "STAFF":
      return "/staff";
    case "ADMIN":
    case "ORG_OWNER":
      return "/admin";
  }
}

/**
 * The mobile tab bar's destinations — at most five, by construction.
 *
 * `nav-items.test.ts` asserts the cap rather than leaving it to review: the failure mode
 * is somebody adding a sixth item to the admin menu and silently making the phone
 * navigation unusable, which nothing else would catch.
 */
export function primaryNavForRole(role: NavRole): NavItem[] {
  switch (role) {
    case "USER":
    case "CUSTOMER":
      return MEMBER_PRIMARY;
    case "TRAINER":
      return TRAINER_PRIMARY;
    case "DIETITIAN":
      return DIETITIAN_PRIMARY;
    case "TEAM_MANAGER":
      return TEAM_MANAGER_PRIMARY;
    case "STAFF":
      return STAFF_PRIMARY;
    case "ADMIN":
    case "ORG_OWNER":
      return ADMIN_PRIMARY;
  }
}

/**
 * The platform console (ADR-001). A separate identity domain entirely — this list is
 * never reachable from a tenant session, and `requirePlatformSession` is what enforces
 * that, not the absence of a link.
 *
 * This was a single entry pointing at a read-only page, which meant provisioning a tenant
 * or its first administrator had no route through the interface at all — the actions
 * existed and were tested, and nothing rendered them. Ordered as the operator's actual
 * sequence: see the estate, create a tenant, give it an administrator, check the trail.
 */
export const PLATFORM_NAV: NavItem[] = [
  { href: "/super-admin", labelKey: "nav.platform", label: "Overview" },
  {
    href: "/super-admin/organizations",
    labelKey: "nav.organizations",
    label: "Organisations",
  },
  { href: "/super-admin/admins", labelKey: "nav.administrators", label: "Administrators" },
  { href: "/super-admin/audit", labelKey: "nav.audit", label: "Audit" },
];
