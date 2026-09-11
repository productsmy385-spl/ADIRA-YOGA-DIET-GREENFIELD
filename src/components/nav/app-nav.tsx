"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarPlus,
  FileText,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Salad,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";

import { signOutAction } from "@/app/sign-in/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";

import { navItemsForRole, type NavItem, type NavRole } from "./nav-items";

/**
 * The application shell's navigation: a top header, a fixed full-height sidebar, and the
 * mobile tab bar.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE SIDEBAR NO LONGER SCROLLS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It used to carry `overflow-y-auto` on its nav list, which produced a second scrolling
 * viewport inside the page — a scrollbar of its own, next to the page's scrollbar. That
 * reads as unfinished, and it is also genuinely worse to use: an operator who scrolls the
 * page expects the page to move, not for the pointer's position over the navigation to
 * silently change what scrolls.
 *
 * The fix is not to hide the scrollbar. Hiding it leaves items unreachable, which is
 * strictly worse than showing one. The fix is to MAKE THE LIST FIT:
 *
 *   - the brand moved OUT of the sidebar and into the header's left cell, which is
 *     otherwise dead space and buys back ~72px
 *   - Notifications moved to the header's bell, where a notification belongs and where it
 *     can carry an unread dot
 *   - Profile moved to the secondary group at the bottom, beside Sign out
 *
 * Nine primary destinations at 42px is 378px, plus a secondary group of about 150px. On
 * the shortest laptop this product targets — 768px tall, so 692px below the header —
 * that leaves well over 100px spare. `overflow-hidden` is then a guard rather than a
 * mechanism: nothing should ever reach it, and if a tenth item is added it fails loudly
 * in review rather than quietly growing a scrollbar again.
 *
 * NOTHING HERE IS AUTHORIZATION. `nav-items.ts` says so at length and it remains true:
 * filtering an item out of this list grants nothing and protects nothing, and every route
 * keeps its own server-side guard.
 */

export interface AppNavProps {
  role: NavRole;
  currentPath?: string;
}

function isActive(item: { href: string }, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

/* ── colour per destination ────────────────────────────────────────────── */

/**
 * One hue per destination, because colour is what makes a nine-item list scannable
 * without reading it. Every item used to be `text-muted-foreground`, going `text-primary`
 * when active — one green for nine places.
 *
 * The four brand accents (`accent-green`/`blue`/`red`/`cyan`) are tokens from
 * `globals.css`; orange, purple, pink and violet are Tailwind palette utilities. Both are
 * utility classes rather than colour VALUES, so invariant 7 holds — what it forbids is a
 * hex literal in `src/`, not the use of a named ramp.
 */
interface NavVisual {
  Icon: typeof LayoutDashboard;
  /** Resting: a tinted glass tile. */
  idle: string;
  /** Selected: the same hue, filled. */
  active: string;
  /** The selected row's background and its focus ring. */
  row: string;
  ring: string;
}

const DEFAULT_VISUAL: NavVisual = {
  Icon: LayoutDashboard,
  idle: "bg-accent-green/12 text-accent-green-ink",
  active: "bg-accent-green text-accent-green-fg",
  row: "bg-accent-green/12 text-accent-green-ink",
  ring: "focus-visible:ring-accent-green/50",
};

function visual(
  Icon: NavVisual["Icon"],
  tint: string,
  fill: string,
  ink: string,
  ring: string,
): NavVisual {
  return {
    Icon,
    idle: `${tint} ${ink}`,
    active: `${fill}`,
    row: `${tint} ${ink}`,
    ring,
  };
}

const NAV_VISUALS: Record<string, NavVisual> = {
  "/admin": visual(
    LayoutDashboard,
    "bg-accent-green/12",
    "bg-accent-green text-accent-green-fg",
    "text-accent-green-ink",
    "focus-visible:ring-accent-green/50",
  ),
  "/trainer": visual(
    LayoutDashboard,
    "bg-accent-green/12",
    "bg-accent-green text-accent-green-fg",
    "text-accent-green-ink",
    "focus-visible:ring-accent-green/50",
  ),
  "/staff": visual(
    LayoutDashboard,
    "bg-accent-green/12",
    "bg-accent-green text-accent-green-fg",
    "text-accent-green-ink",
    "focus-visible:ring-accent-green/50",
  ),
  "/dashboard": visual(
    LayoutDashboard,
    "bg-accent-green/12",
    "bg-accent-green text-accent-green-fg",
    "text-accent-green-ink",
    "focus-visible:ring-accent-green/50",
  ),
  "/today": visual(
    CalendarCheck,
    "bg-accent-green/12",
    "bg-accent-green text-accent-green-fg",
    "text-accent-green-ink",
    "focus-visible:ring-accent-green/50",
  ),
  "/admin/access-requests": visual(
    KeyRound,
    "bg-accent-blue/12",
    "bg-accent-blue text-accent-blue-fg",
    "text-accent-blue-ink",
    "focus-visible:ring-accent-blue/50",
  ),
  "/admin/programmes": visual(
    CalendarPlus,
    "bg-accent-red/12",
    "bg-accent-red text-accent-red-fg",
    "text-accent-red-ink",
    "focus-visible:ring-accent-red/50",
  ),
  "/admin/yoga": visual(
    Activity,
    "bg-accent-cyan/16",
    "bg-accent-cyan text-accent-cyan-fg",
    "text-accent-cyan-ink",
    "focus-visible:ring-accent-cyan/50",
  ),
  "/admin/diet": visual(
    Salad,
    "bg-orange-500/14",
    "bg-orange-500 text-white",
    "text-orange-700 dark:text-orange-300",
    "focus-visible:ring-orange-500/50",
  ),
  "/admin/reports": visual(
    FileText,
    "bg-purple-500/14",
    "bg-purple-600 text-white",
    "text-purple-700 dark:text-purple-300",
    "focus-visible:ring-purple-500/50",
  ),
  "/reports": visual(
    FileText,
    "bg-purple-500/14",
    "bg-purple-600 text-white",
    "text-purple-700 dark:text-purple-300",
    "focus-visible:ring-purple-500/50",
  ),
  "/admin/analytics": visual(
    BarChart3,
    "bg-accent-blue/12",
    "bg-accent-blue text-accent-blue-fg",
    "text-accent-blue-ink",
    "focus-visible:ring-accent-blue/50",
  ),
  "/admin/members": visual(
    Users,
    "bg-pink-500/14",
    "bg-pink-600 text-white",
    "text-pink-700 dark:text-pink-300",
    "focus-visible:ring-pink-500/50",
  ),
  "/admin/team": visual(
    Users,
    "bg-teal-500/14",
    "bg-teal-600 text-white",
    "text-teal-700 dark:text-teal-300",
    "focus-visible:ring-teal-500/50",
  ),
  "/progress": visual(
    TrendingUp,
    "bg-violet-500/14",
    "bg-violet-600 text-white",
    "text-violet-700 dark:text-violet-300",
    "focus-visible:ring-violet-500/50",
  ),
  "/notifications": visual(
    Bell,
    "bg-pink-500/14",
    "bg-pink-600 text-white",
    "text-pink-700 dark:text-pink-300",
    "focus-visible:ring-pink-500/50",
  ),
  "/profile": visual(
    User,
    "bg-accent-blue/12",
    "bg-accent-blue text-accent-blue-fg",
    "text-accent-blue-ink",
    "focus-visible:ring-accent-blue/50",
  ),
};

function visualFor(href: string): NavVisual {
  return NAV_VISUALS[href] ?? DEFAULT_VISUAL;
}

/** The tinted tile an icon sits in. Reads as depth at 32px where a bare stroke does not. */
function NavIcon({ href, active }: { href: string; active: boolean }) {
  const v = visualFor(href);
  return (
    <span
      aria-hidden
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-(--duration-fast) ${
        active ? `${v.active} shadow-sm` : v.idle
      }`}
    >
      <v.Icon className="size-4" />
    </span>
  );
}

/** One row, shared by the sidebar and the mobile drawer so they cannot drift apart. */
function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const v = visualFor(item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition-all duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${v.ring} ${
        active
          ? `${v.row} shadow-2xs`
          : "text-foreground/70 hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      <NavIcon href={item.href} active={active} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Destinations that appear somewhere OTHER than the primary sidebar list.
 *
 * Notifications lives in the header bell; Profile lives in the secondary group at the
 * bottom. They are filtered here rather than removed from `nav-items.ts`, because that
 * file is the shared source of truth for what a role can reach — including for the mobile
 * drawer, which still lists everything.
 */
const RELOCATED = new Set(["/notifications", "/profile"]);

export function AppNav({ role, currentPath }: AppNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const items = navItemsForRole(role);
  const effectivePath = currentPath || pathname;
  const [prevPath, setPrevPath] = useState(effectivePath);

  const primary = items.filter((item) => !RELOCATED.has(item.href));
  const home = role === "CUSTOMER" || role === "USER" ? "/today" : "/admin";

  // Auto-close the drawer on navigation.
  if (effectivePath !== prevPath) {
    setPrevPath(effectivePath);
    setDrawerOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    if (drawerOpen) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [drawerOpen]);

  return (
    <>
      {/* ── DESKTOP HEADER ───────────────────────────────────────────────
          Spans the full width with the brand occupying the sidebar's column, so the
          logo and the first nav item cannot collide — the two own separate cells
          rather than being stacked in the same one. */}
      <header
        aria-label="Application header"
        className="fixed inset-x-0 top-0 z-50 hidden h-(--shell-header) border-b border-border-glass bg-linear-to-r from-accent-cyan/25 via-accent-blue/15 to-accent-green/15 backdrop-blur-glass sm:flex"
      >
        <div className="flex h-full w-(--shell-sidebar) shrink-0 items-center gap-2.5 border-r border-border-glass px-5">
          <Link href={home} className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-9 shrink-0 mix-blend-multiply dark:mix-blend-screen"
            />
            <span className="leading-tight">
              <span className="block text-lg font-extrabold tracking-tight text-foreground">
                {branding.name}
              </span>
              <span className="block text-[11px] font-medium text-foreground/60">
                Wellness in Balance
              </span>
            </span>
          </Link>
        </div>

        {/*
          No search field. The reference design shows one, but this application has no
          global search — no index, no endpoint, no page. Rendering the input would be a
          control that looks functional and does nothing, which is the failure mode this
          codebase already has a guard test for. It belongs here the day search exists.
        */}
        <div className="flex flex-1 items-center justify-end gap-2 px-5">
          <Button asChild variant="ghost" size="icon" className="size-10 rounded-xl">
            <Link href={home} aria-label="Home">
              <Home className="size-5 text-accent-green-ink" />
            </Link>
          </Button>

          <Button asChild variant="ghost" size="icon" className="size-10 rounded-xl">
            <Link href="/notifications" aria-label="Notifications">
              <Bell className="size-5 text-pink-600 dark:text-pink-300" />
            </Link>
          </Button>

          <ThemeToggle />

          <span aria-hidden className="mx-1 h-7 w-px bg-border-glass" />

          {/* Profile. A LINK, never a form — see the mobile header for why. */}
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-glass-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
          >
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-full bg-accent-blue text-sm font-bold text-accent-blue-fg"
            >
              <User className="size-4" />
            </span>
            <span className="hidden text-sm font-semibold text-foreground lg:block">
              Profile
            </span>
          </Link>
        </div>
      </header>

      {/* ── DESKTOP SIDEBAR ──────────────────────────────────────────────
          Sits BELOW the header (`top-(--shell-header)`) rather than beside it, so the
          two never overlap and the header's brand cell lines up with this column. */}
      <aside
        aria-label="Desktop Navigation Sidebar"
        className="fixed bottom-0 left-0 top-(--shell-header) z-40 hidden w-(--shell-sidebar) flex-col border-r border-border-glass bg-surface-glass-strong backdrop-blur-glass sm:flex"
      >
        {/* `overflow-hidden` is a GUARD, not a scroll mechanism — the list is sized to
            fit, and anything that overflows should be caught in review. */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-3">
          {primary.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(item, effectivePath)}
            />
          ))}
        </nav>

        {/* Secondary, anchored to the bottom. */}
        <div className="shrink-0 border-t border-border-glass p-3">
          <div className="flex items-center justify-between rounded-xl px-2.5 py-1.5">
            <span className="text-sm font-semibold text-foreground/70">Theme</span>
            <ThemeToggle />
          </div>

          <NavRow
            item={{ href: "/profile", label: "Profile", labelKey: "nav.profile" }}
            active={isActive({ href: "/profile" }, effectivePath)}
          />

          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-foreground/70 transition-colors hover:bg-accent-red/10 hover:text-accent-red-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50"
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-red/12 text-accent-red-ink"
              >
                <LogOut className="size-4" />
              </span>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── MOBILE HEADER ────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-(--shell-header-mobile) items-center justify-between border-b border-border-glass bg-linear-to-r from-accent-cyan/25 to-accent-blue/15 px-4 backdrop-blur-glass sm:hidden">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="size-9 text-foreground"
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <Link href={home} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-6 shrink-0 mix-blend-multiply dark:mix-blend-screen"
            />
            <span className="text-sm font-extrabold tracking-tight text-foreground">
              {branding.name}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="size-9">
            <Link href="/notifications" aria-label="Notifications">
              <Bell className="size-4 text-pink-600 dark:text-pink-300" aria-hidden />
            </Link>
          </Button>
          <ThemeToggle />
          {/*
            Profile is a LINK to /profile and is deliberately NOT inside the sign-out
            form. It was once rendered inside it, so tapping the account icon logged the
            user out — `app-nav.test.tsx` now asserts this link has no ancestor form.
          */}
          <Button asChild variant="ghost" size="icon" className="size-9">
            <Link href="/profile" aria-label="Profile Screen">
              <User className="size-4 text-accent-blue-ink" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── MOBILE DRAWER ────────────────────────────────────────────────
          Lists EVERY destination for the role, including the ones the desktop sidebar
          relocates, because a phone has no header bell row to put them in. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm sm:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        aria-label="Mobile Navigation Drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-80 flex-col border-r border-border-glass bg-background p-4 shadow-2xl transition-transform duration-200 ease-out sm:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-glass pb-4">
          <Link
            href={home}
            className="flex items-center gap-2.5"
            onClick={() => setDrawerOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-7 shrink-0 mix-blend-multiply dark:mix-blend-screen"
            />
            <span className="text-base font-extrabold tracking-tight text-foreground">
              {branding.name}
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="size-9"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto py-4">
          {items.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(item, effectivePath)}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))}
        </nav>

        <div className="space-y-2 border-t border-border-glass pt-3">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-sm font-semibold text-foreground/70">Theme</span>
            <ThemeToggle />
          </div>
          <form action={signOutAction} className="w-full">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:bg-accent-red/10 hover:text-accent-red-ink"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <MobileTabBar role={role} currentPath={effectivePath} />
    </>
  );
}

/**
 * The persistent mobile bottom bar — five destinations with a centre action.
 *
 * Always mounted, `fixed`, and padded for the home indicator via
 * `env(safe-area-inset-bottom)`. `app-nav.test.tsx` asserts it renders on every key
 * route, because the failure it guards against is it disappearing on one page.
 */
export function MobileTabBar({ role, currentPath }: AppNavProps) {
  const isMember = role === "CUSTOMER" || role === "USER";

  const tabs = isMember
    ? [
        { href: "/today", label: "Today" },
        { href: "/progress", label: "Progress" },
        { href: "/experience/yoga", label: "Practice", isCenter: true },
        { href: "/notifications", label: "Alerts" },
        { href: "/profile", label: "Profile" },
      ]
    : [
        { href: "/admin", label: "Caseload" },
        { href: "/admin/programmes", label: "Plans" },
        { href: "/admin/yoga", label: "Add", isCenter: true },
        { href: "/admin/members", label: "Members" },
        { href: "/profile", label: "Profile" },
      ];

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-glass bg-surface-glass-strong pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-glass sm:hidden"
    >
      <ul className="flex items-center justify-around px-2">
        {tabs.map((item) => {
          const active = isActive(item, currentPath);

          if (item.isCenter) {
            return (
              <li key={item.href} className="flex shrink-0 items-center justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex size-11 items-center justify-center rounded-full bg-accent-green text-accent-green-fg shadow-md transition-transform duration-200 active:scale-90 motion-reduce:active:scale-100"
                >
                  <Plus className="size-6 stroke-[2.5]" aria-hidden />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 py-1 text-[10px] font-semibold transition-all duration-(--duration-fast) active:scale-95 motion-reduce:active:scale-100 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <NavIcon href={item.href} active={active} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
