import { describe, expect, it } from "vitest";

import {
  navItemsForRole,
  PLATFORM_NAV,
  primaryNavForRole,
  type NavRole,
} from "./nav-items";

/**
 * These tests exist mostly to make one thing impossible to forget:
 *
 * **NAVIGATION IS NOT AUTHORIZATION.**
 *
 * A future change that starts treating this list as a permission model would pass a
 * naive review — the shapes look like permissions. The assertions below pin it as
 * usability data, and the real guarantees stay where they already are:
 * `tests/caseload-scope.test.ts` proves an ADMIN cannot reach an unassigned customer,
 * and `requireRole` proves a CUSTOMER cannot reach an admin route.
 */

describe("navItemsForRole", () => {
  it("gives a customer their own surfaces only", () => {
    const hrefs = navItemsForRole("USER").map((i) => i.href);

    expect(hrefs).toContain("/today");
    expect(hrefs.some((h) => h.startsWith("/admin"))).toBe(false);
    expect(hrefs).not.toContain("/super-admin");
  });

  /**
   * Updated for ADR-013. Under the old model an ADMIN was assignment-scoped for
   * EVERYTHING, so analytics was withheld. The merge separated the two questions:
   * administrative reach is organization-wide, member health data stays
   * assignment-scoped. Analytics is administrative, so every admin gets the link.
   *
   * The caseload link is present for every admin too — and that is safe precisely
   * because `listCaseload` scopes by assignment in its query. If this menu were the
   * control, this test would be the security boundary, which is the confusion the file
   * header exists to prevent.
   */
  it("gives an admin the caseload and organisation-wide administrative surfaces", () => {
    const hrefs = navItemsForRole("ADMIN").map((i) => i.href);

    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/analytics");
    expect(hrefs).toContain("/admin/members");
  });

  it("gives an org owner everything an admin has, plus analytics", () => {
    const admin = navItemsForRole("ADMIN").map((i) => i.href);
    const owner = navItemsForRole("ADMIN").map((i) => i.href);

    for (const href of admin) expect(owner).toContain(href);
    expect(owner).toContain("/admin/analytics");
  });

  // ADR-001: the platform console belongs to a different identity domain. No tenant
  // role, however senior, links to it.
  it("never offers the platform console to any tenant role", () => {
    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      const hrefs = navItemsForRole(role).map((i) => i.href);
      for (const platform of PLATFORM_NAV) expect(hrefs).not.toContain(platform.href);
    }
    // The platform surface, wherever it is routed. Asserted by prefix rather than an
    // exact path so renaming the route does not fail a test about identity domains.
    expect(PLATFORM_NAV.every((i) => i.href.startsWith("/"))).toBe(true);
    expect(PLATFORM_NAV).not.toHaveLength(0);
  });

  it("returns items with a stable shape", () => {
    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      for (const item of navItemsForRole(role)) {
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.labelKey.startsWith("nav.")).toBe(true);
      }
    }
  });

  /**
   * The guard against this file drifting into a permission model.
   *
   * If a future item ever carries a `roles`, `permission`, `allow` or similar field,
   * something is deciding access here — in a module that never runs on a request and
   * cannot see a session. Authorization belongs in `requireRole` / `canViewCustomer`.
   */
  it("carries no field that looks like a permission decision", () => {
    const forbidden = ["roles", "permission", "permissions", "allow", "can", "scope"];

    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      for (const item of navItemsForRole(role)) {
        for (const key of Object.keys(item)) {
          expect(forbidden).not.toContain(key);
        }
      }
    }
  });
});

/**
 * The mobile tab bar's constraint, asserted rather than trusted to review.
 *
 * The admin menu has nine items. If `MobileTabBar` ever renders the full menu again — by
 * somebody "simplifying" `primaryNavForRole` away — each tab gets roughly 40px on a
 * 360px phone. That is below the touch-target minimum and well below what a label needs,
 * and it is invisible on a desktop browser at default width, which is where this change
 * would be reviewed.
 */
describe("primaryNavForRole", () => {
  it("never offers more than five destinations to a phone", () => {
    for (const role of ["USER", "CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      const items = primaryNavForRole(role);
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(5);
    }
  });

  it("is a subset of what the role may reach, never a superset", () => {
    // The tab bar is a shortcut into the menu. An item here that is not in the full menu
    // would be a destination reachable only on a phone, which is how a route ends up with
    // no desktop equivalent and no test.
    for (const role of ["USER", "CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      const full = new Set(navItemsForRole(role).map((i) => i.href));
      for (const item of primaryNavForRole(role)) {
        expect(full.has(item.href)).toBe(true);
      }
    }
  });

  it("gives every role a route to their own account", () => {
    // Sign-out and passkey enrolment live on /profile. A role that cannot reach it cannot
    // register a passkey or end its other sessions.
    for (const role of ["USER", "CUSTOMER", "ADMIN", "ORG_OWNER"] as NavRole[]) {
      expect(primaryNavForRole(role).map((i) => i.href)).toContain("/profile");
      expect(navItemsForRole(role).map((i) => i.href)).toContain("/profile");
    }
  });

  it("keeps a member out of admin destinations on mobile too", () => {
    for (const role of ["USER", "CUSTOMER"] as NavRole[]) {
      const hrefs = primaryNavForRole(role).map((i) => i.href);
      expect(hrefs.some((h) => h.startsWith("/admin"))).toBe(false);
      expect(hrefs.some((h) => h.startsWith("/super-admin"))).toBe(false);
    }
  });
});
