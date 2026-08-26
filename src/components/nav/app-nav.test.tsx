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
