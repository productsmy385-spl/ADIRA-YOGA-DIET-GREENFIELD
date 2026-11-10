import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { AppNav } from "./app-nav";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock signOutAction
vi.mock("@/app/sign-in/actions", () => ({
  signOutAction: vi.fn(),
}));

describe("AppNav & Mobile Architecture", () => {
  it("renders mobile bottom nav on /admin (Caseload) for ADMIN role", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);

    const nav = screen.getByRole("navigation", { name: "Mobile Navigation Bar" });
    expect(nav).toBeInTheDocument();

    const withinNav = within(nav);
    expect(withinNav.getByText("Caseload")).toBeInTheDocument();
    expect(withinNav.getByText("Plans")).toBeInTheDocument();
    expect(withinNav.getByText("Members")).toBeInTheDocument();
    expect(withinNav.getByText("Profile")).toBeInTheDocument();
  });

  it("renders mobile bottom nav across all key authenticated routes", () => {
    const paths = [
      "/admin",
      "/admin/access-requests",
      "/admin/programmes",
      "/admin/yoga",
      "/admin/diet",
      "/admin/members",
      "/admin/team",
      "/notifications",
      "/profile",
      "/today",
    ];

    for (const path of paths) {
      const role = path === "/today" ? "CUSTOMER" : "ADMIN";
      const { unmount } = render(<AppNav role={role} currentPath={path} />);
      const nav = screen.getByRole("navigation", { name: "Mobile Navigation Bar" });
      expect(nav).toBeInTheDocument();
      unmount();
    }
  });

  it("opens mobile drawer on clicking hamburger button and renders role items", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);

    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(menuButton).toBeInTheDocument();

    fireEvent.click(menuButton);

    const drawer = screen.getByLabelText("Mobile Navigation Drawer");
    expect(drawer).toBeInTheDocument();
    expect(drawer.className).toContain("translate-x-0");

    // Check secondary items rendered inside drawer
    const withinDrawer = within(drawer);
    expect(withinDrawer.getByText("Requests")).toBeInTheDocument();
    expect(withinDrawer.getByText("Yoga")).toBeInTheDocument();
    expect(withinDrawer.getByText("Diet")).toBeInTheDocument();
    expect(withinDrawer.getByText("Analytics")).toBeInTheDocument();
    expect(withinDrawer.getByText("Team")).toBeInTheDocument();
  });

  it("ensures Profile top header button links to /profile and does NOT submit a sign-out form", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);

    const profileLinks = screen.getAllByRole("link", { name: /profile/i });
    expect(profileLinks.length).toBeGreaterThan(0);

    const topHeaderProfileLink = profileLinks.find(
      (link) => link.getAttribute("href") === "/profile"
    );
    expect(topHeaderProfileLink).toBeInTheDocument();
    expect(topHeaderProfileLink?.closest("form")).toBeNull();
  });

  it("provides an explicit Sign out button for ending sessions", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);

    const signOutButtons = screen.getAllByRole("button", { name: "Sign out" });
    expect(signOutButtons.length).toBeGreaterThan(0);
  });
});

/**
 * Stage 2 of the platform upgrade (brief Phases 9 and 11). Each test pins a defect that
 * existed before it, so it cannot quietly return.
 */
describe("Role-aware navigation", () => {
  const tabsFor = (role: Parameters<typeof AppNav>[0]["role"], path: string) => {
    render(<AppNav role={role} currentPath={path} />);
    const bar = screen.getByRole("navigation", { name: "Mobile Navigation Bar" });
    return within(bar)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
  };

  // Was: hard-coded admin tabs for every non-member, including the org-wide roster.
  it("never offers TRAINER the organization-wide Members page", () => {
    const hrefs = tabsFor("TRAINER", "/trainer");
    expect(hrefs).not.toContain("/admin/members");
    expect(hrefs).toContain("/trainer");
  });

  it("never offers STAFF the programme library or Members", () => {
    const hrefs = tabsFor("STAFF", "/staff");
    expect(hrefs).not.toContain("/admin/members");
    expect(hrefs).not.toContain("/admin/programmes");
    expect(hrefs).not.toContain("/admin/yoga");
  });

  it("never offers TEAM_MANAGER the website, settings or libraries (ADR-016)", () => {
    render(<AppNav role="TEAM_MANAGER" currentPath="/admin/team" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const hrefs = within(sidebar).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/members");
    for (const forbidden of ["/admin/website", "/admin/yoga", "/admin/diet", "/admin/programmes"]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("never offers DIETITIAN the yoga library or members (ADR-016)", () => {
    render(<AppNav role="DIETITIAN" currentPath="/trainer" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const hrefs = within(sidebar).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/diet");
    expect(hrefs).not.toContain("/admin/yoga");
    expect(hrefs).not.toContain("/admin/members");
  });

  it("shows at most five bottom destinations for every role", () => {
    for (const role of ["ADMIN", "TEAM_MANAGER", "TRAINER", "DIETITIAN", "STAFF", "USER"] as const) {
      const { unmount } = render(<AppNav role={role} currentPath="/x" />);
      const bar = screen.getByRole("navigation", { name: "Mobile Navigation Bar" });
      expect(within(bar).getAllByRole("link").length).toBeLessThanOrEqual(5);
      unmount();
    }
  });

  // Was: the logo sent TRAINER and STAFF to /admin, which refuses them.
  it("sends each role's brand mark to its own home", () => {
    const { unmount } = render(<AppNav role="TRAINER" currentPath="/trainer" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(within(sidebar).getAllByRole("link")[0]).toHaveAttribute("href", "/trainer");
    unmount();

    render(<AppNav role="STAFF" currentPath="/staff" />);
    const staffSidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(within(staffSidebar).getAllByRole("link")[0]).toHaveAttribute("href", "/staff");
  });

  // Was: sixteen pages rendered their own bar on top of AppNav's.
  it("renders exactly one bottom bar", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);
    expect(screen.getAllByRole("navigation", { name: "Mobile Navigation Bar" })).toHaveLength(1);
  });

  it("hides the bottom bar on full-screen practice routes", () => {
    render(<AppNav role="USER" currentPath="/experience/yoga" />);
    expect(screen.queryByRole("navigation", { name: "Mobile Navigation Bar" })).toBeNull();
  });

  // Was: /admin (Caseload) prefix-matched every /admin/... page — two items "current".
  it("marks exactly one sidebar item current on a nested admin page", () => {
    render(<AppNav role="ADMIN" currentPath="/admin/website" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const current = within(sidebar)
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/admin/website"]);
  });

  it("marks the current destination with aria-current", () => {
    render(<AppNav role="ADMIN" currentPath="/admin/members" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(within(sidebar).getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("Mobile drawer is a real modal", () => {
  it("is inert while closed, so its links cannot be tabbed to off-screen", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);
    const drawer = screen.getByLabelText("Mobile Navigation Drawer");
    expect(drawer).toHaveAttribute("inert");
    expect(drawer).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus in on open, closes on Escape, and returns focus to the trigger", () => {
    render(<AppNav role="ADMIN" currentPath="/admin" />);
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });

    fireEvent.click(trigger);
    const drawer = screen.getByLabelText("Mobile Navigation Drawer");
    expect(drawer).not.toHaveAttribute("inert");
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer.className).toContain("-translate-x-full");
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Sidebar collapse", () => {
  it("toggles the <html> state and remembers it", async () => {
    document.documentElement.dataset.sidebar = "expanded";
    render(<AppNav role="ADMIN" currentPath="/admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
    expect(localStorage.getItem("adira-sidebar")).toBe("collapsed");

    // The label follows the attribute via a MutationObserver, which fires asynchronously.
    fireEvent.click(await screen.findByRole("button", { name: "Expand sidebar" }));
    expect(document.documentElement.dataset.sidebar).toBe("expanded");
    expect(localStorage.getItem("adira-sidebar")).toBe("expanded");
  });

  // The label doubles as the rail's tooltip, so collapsing never removes the link's name.
  it("keeps every sidebar link's accessible name when collapsed", () => {
    document.documentElement.dataset.sidebar = "collapsed";
    render(<AppNav role="ADMIN" currentPath="/admin" />);
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    for (const name of ["Caseload", "Members", "Team", "Analytics"]) {
      expect(within(sidebar).getByRole("link", { name })).toBeInTheDocument();
    }
  });
});
