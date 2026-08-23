import { describe, expect, it } from "vitest";

import { navItemsForRole, PLATFORM_NAV } from "./nav-items";

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
    const hrefs = navItemsForRole("CUSTOMER").map((i) => i.href);

    expect(hrefs).toContain("/today");
    expect(hrefs.some((h) => h.startsWith("/admin"))).toBe(false);
    expect(hrefs).not.toContain("/owner");
  });

  it("gives an admin the caseload but not organisation-wide analytics", () => {
    const hrefs = navItemsForRole("ADMIN").map((i) => i.href);

    expect(hrefs).toContain("/admin");
    // ADR-002: ADMIN is assignment-scoped, so org-wide figures are not theirs to see.
    expect(hrefs).not.toContain("/admin/analytics");
  });

  it("gives an org owner everything an admin has, plus analytics", () => {
    const admin = navItemsForRole("ADMIN").map((i) => i.href);
    const owner = navItemsForRole("ORG_OWNER").map((i) => i.href);

    for (const href of admin) expect(owner).toContain(href);
    expect(owner).toContain("/admin/analytics");
  });

  // ADR-001: the platform console belongs to a different identity domain. No tenant
  // role, however senior, links to it.
  it("never offers the platform console to any tenant role", () => {
    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as const) {
      expect(navItemsForRole(role).map((i) => i.href)).not.toContain("/owner");
    }
    expect(PLATFORM_NAV.map((i) => i.href)).toContain("/owner");
  });

  it("returns items with a stable shape", () => {
    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as const) {
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

    for (const role of ["CUSTOMER", "ADMIN", "ORG_OWNER"] as const) {
      for (const item of navItemsForRole(role)) {
        for (const key of Object.keys(item)) {
          expect(forbidden).not.toContain(key);
        }
      }
    }
  });
});
