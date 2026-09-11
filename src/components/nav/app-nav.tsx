"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
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
 * Top navigation. There is no desktop sidebar.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE SIDEBAR IS GONE RATHER THAN FIXED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A 260px column cost a fifth of a 1280px screen permanently, to show nine links that are
 * read once and then navigated by muscle memory. It also could not stop growing: every
 * new destination made the column taller until it needed its own scrollbar, which is the
 * defect that started this.
 *
 * Moving navigation into the header removes the failure mode rather than managing it —
 * a horizontal bar that runs out of room degrades into a "More" menu, which is bounded,
 * whereas a vertical list just gets taller.
 *
 * ── How the bar stays inside its width ─────────────────────────────────────────
 * Nine destinations at ~76px is ~684px, plus ~200px of brand and ~230px of account
 * controls: about 1114px. That fits 1280 and does NOT fit 1024. So the split is by
 * breakpoint, not by hope:
 *
 *   ≥1280px  all destinations inline
 *   ≥640px   the five primary ones inline, the rest in "More"
 *   <640px   no top nav at all — the drawer and the bottom tab bar, as before
 *
 * Nothing scrolls horizontally at any width, which is the property a header has to have.
 *
 * NOTHING HERE IS AUTHORIZATION. `nav-items.ts` says so at length and it stays true:
 * hiding a link grants nothing, and every route keeps its own server-side guard.
 */

export interface AppNavProps {
  role: NavRole;
  currentPath?: string;
}

function isActive(item: { href: string }, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

/* ── one hue per destination ───────────────────────────────────────────── */

interface NavVisual {
  Icon: typeof LayoutDashboard;
  /** Tile paint at rest. */
  tile: string;
  /** Tile paint when this is the current page — the same hue, filled. */
  tileActive: string;
  ring: string;
}

function v(
  Icon: NavVisual["Icon"],
  tile: string,
  tileActive: string,
  ring: string,
): NavVisual {
  return { Icon, tile, tileActive, ring };
}

const DEFAULT_VISUAL = v(
  LayoutDashboard,
  "bg-accent-green/14 text-accent-green-ink",
  "bg-accent-green text-accent-green-fg",
  "focus-visible:ring-accent-green/50",
);

/**
 * Colour is what makes a nine-item bar scannable without reading it. Every item was once
 * `text-muted-foreground` going `text-primary` when active — one green for nine places.
 *
 * The four `accent-*` values are tokens from `globals.css`; orange, purple, pink and
 * violet are Tailwind ramps. Both are utility classes rather than colour VALUES, so
 * invariant 7 holds — it forbids a hex literal in `src/`, not the use of a named ramp.
 */
const NAV_VISUALS: Record<string, NavVisual> = {
  "/admin": DEFAULT_VISUAL,
  "/trainer": DEFAULT_VISUAL,
  "/staff": DEFAULT_VISUAL,
  "/dashboard": DEFAULT_VISUAL,
  "/today": v(
    CalendarCheck,
    "bg-accent-green/14 text-accent-green-ink",
    "bg-accent-green text-accent-green-fg",
    "focus-visible:ring-accent-green/50",
  ),
  "/admin/access-requests": v(
    KeyRound,
    "bg-accent-blue/14 text-accent-blue-ink",
    "bg-accent-blue text-accent-blue-fg",
    "focus-visible:ring-accent-blue/50",
  ),
  "/admin/programmes": v(
    CalendarPlus,
    "bg-accent-red/12 text-accent-red-ink",
    "bg-accent-red text-accent-red-fg",
    "focus-visible:ring-accent-red/50",
  ),
  "/admin/yoga": v(
    Activity,
    "bg-accent-cyan/18 text-accent-cyan-ink",
    "bg-accent-cyan text-accent-cyan-fg",
    "focus-visible:ring-accent-cyan/50",
  ),
  "/admin/diet": v(
    Salad,
    "bg-orange-500/16 text-orange-700 dark:text-orange-300",
    "bg-orange-500 text-white",
    "focus-visible:ring-orange-500/50",
  ),
  "/admin/reports": v(
    FileText,
    "bg-purple-500/16 text-purple-700 dark:text-purple-300",
    "bg-purple-600 text-white",
    "focus-visible:ring-purple-500/50",
  ),
  "/reports": v(
    FileText,
    "bg-purple-500/16 text-purple-700 dark:text-purple-300",
    "bg-purple-600 text-white",
    "focus-visible:ring-purple-500/50",
  ),
  "/admin/analytics": v(
    BarChart3,
    "bg-accent-blue/14 text-accent-blue-ink",
    "bg-accent-blue text-accent-blue-fg",
    "focus-visible:ring-accent-blue/50",
  ),
  "/admin/members": v(
    Users,
    "bg-pink-500/16 text-pink-700 dark:text-pink-300",
    "bg-pink-600 text-white",
    "focus-visible:ring-pink-500/50",
  ),
  "/admin/team": v(
    Users,
    "bg-violet-500/16 text-violet-700 dark:text-violet-300",
    "bg-violet-600 text-white",
    "focus-visible:ring-violet-500/50",
  ),
  "/progress": v(
    TrendingUp,
    "bg-violet-500/16 text-violet-700 dark:text-violet-300",
    "bg-violet-600 text-white",
    "focus-visible:ring-violet-500/50",
  ),
  "/notifications": v(
    Bell,
    "bg-pink-500/16 text-pink-700 dark:text-pink-300",
    "bg-pink-600 text-white",
    "focus-visible:ring-pink-500/50",
  ),
  "/profile": v(
    User,
    "bg-accent-blue/14 text-accent-blue-ink",
    "bg-accent-blue text-accent-blue-fg",
    "focus-visible:ring-accent-blue/50",
  ),
};

function visualFor(href: string): NavVisual {
  return NAV_VISUALS[href] ?? DEFAULT_VISUAL;
}

/** The icon tile. Reads as depth at 36px where a bare stroke icon does not. */
function NavTile({
  href,
  active,
  size = "md",
}: {
  href: string;
  active: boolean;
  size?: "md" | "sm";
}) {
  const { Icon, tile, tileActive } = visualFor(href);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl transition-all duration-(--duration-fast) ${
        size === "md" ? "size-9" : "size-8"
      } ${active ? `${tileActive} shadow-sm` : tile}`}
    >
      <Icon className={size === "md" ? "size-4.5" : "size-4"} />
    </span>
  );
}

/** A destination in the top bar: tile above label, as in the reference composition. */
function TopNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const { ring } = visualFor(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex w-19 shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-all duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${ring} ${
        active
          ? "bg-surface-glass-strong shadow-sm"
          : "hover:bg-surface-glass motion-reduce:hover:bg-surface-glass"
      }`}
    >
      <NavTile href={item.href} active={active} />
      <span
        className={`w-full truncate text-center text-[11px] leading-tight ${
          active ? "font-bold text-foreground" : "font-semibold text-foreground/75"
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}

/**
 * The overflow menu for destinations that do not fit.
 *
 * A real menu rather than a hover-reveal: it is keyboard reachable, closes on Escape and
 * on outside click, and reports its state with `aria-expanded`. Hover-only disclosure
 * would make these destinations unreachable by keyboard and on touch.
 */
function MoreMenu({
  items,
  currentPath,
  className,
}: {
  items: NavItem[];
  currentPath?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const anyActive = items.some((item) => isActive(item, currentPath));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={wrap} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-19 shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 ${
          anyActive || open ? "bg-surface-glass-strong shadow-sm" : "hover:bg-surface-glass"
        }`}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/8 text-foreground/70"
        >
          <MoreHorizontal className="size-4.5" />
        </span>
        <span className="text-[11px] font-semibold leading-tight text-foreground/75">
          More
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-border-glass bg-popover p-2 shadow-xl"
        >
          {items.map((item) => {
            const active = isActive(item, currentPath);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-foreground/75 hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                <NavTile href={item.href} active={active} size="sm" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The account menu: Profile, Theme and Sign out, kept visibly separate.
 *
 * Profile is a LINK and Sign out is a form SUBMIT, and they are deliberately not adjacent
 * look-alikes — the account control once sat inside the sign-out form, so tapping it
 * logged the user out. `app-nav.test.tsx` asserts the profile link has no ancestor form.
 */
function AccountMenu({ currentPath }: { currentPath?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex min-h-11 items-center gap-2 rounded-2xl px-1.5 py-1 transition-colors hover:bg-surface-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white"
        >
          <User className="size-4" />
        </span>
        <ChevronDown className="size-4 text-foreground/60" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border-glass bg-popover p-2 shadow-xl"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            aria-current={isActive({ href: "/profile" }, currentPath) ? "page" : undefined}
            className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <NavTile href="/profile" active={false} size="sm" />
            Profile
          </Link>

          <div className="flex items-center justify-between rounded-xl px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground/80">Theme</span>
            <ThemeToggle />
          </div>

          <div className="my-1 h-px bg-border-glass" />

          {/* Sign out: the ONLY control that ends the session, in its own form. */}
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-accent-red/10 hover:text-accent-red-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50"
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-red/12 text-accent-red-ink"
              >
                <LogOut className="size-4" />
              </span>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Destinations that live in the account menu or the bell rather than the bar. */
const RELOCATED = new Set(["/notifications", "/profile"]);

/** How many fit inline before "More" takes over, per tier. See the bar's comment. */
const INLINE_AT_SMALL = 3;
const INLINE_AT_MEDIUM = 5;

export function AppNav({ role, currentPath }: AppNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const items = navItemsForRole(role);
  const effectivePath = currentPath || pathname;
  const [prevPath, setPrevPath] = useState(effectivePath);

  const destinations = items.filter((item) => !RELOCATED.has(item.href));
  const home = role === "CUSTOMER" || role === "USER" ? "/today" : "/admin";

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

  const inline = destinations.slice(0, INLINE_AT_MEDIUM);
  const overflow = destinations.slice(INLINE_AT_MEDIUM);

  return (
    <>
      {/* ── DESKTOP TOP BAR ──────────────────────────────────────────────
          The only desktop navigation. There is no sidebar and no element offsets the
          page from the left any more. */}
      <header
        aria-label="Application header"
        className="fixed inset-x-0 top-0 z-50 hidden h-(--shell-header) border-b border-border-glass bg-linear-to-r from-accent-cyan/30 via-accent-blue/18 to-accent-green/18 backdrop-blur-glass sm:flex"
      >
        <div className="mx-auto flex h-full w-full max-w-[1800px] items-center gap-3 px-4 lg:px-6">
          {/* Brand */}
          <Link href={home} className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-10 shrink-0 mix-blend-multiply dark:mix-blend-screen"
            />
            {/* Wordmark appears only from `lg`. Between 768 and 1023 the ~120px it costs
                is the difference between the bar fitting and overflowing. */}
            <span className="hidden leading-tight lg:block">
              <span className="block text-lg font-extrabold tracking-tight text-foreground">
                {branding.name}
              </span>
              <span className="block text-[11px] font-medium text-foreground/60">
                Wellness in Balance
              </span>
            </span>
          </Link>

          <span aria-hidden className="mx-1 h-9 w-px shrink-0 bg-border-glass" />

          {/* Destinations. `justify-center` keeps the bar balanced when a role has few. */}
          <nav
            aria-label="Primary"
            className="flex min-w-0 flex-1 items-center justify-center gap-0.5"
          >
            {/*
              Three tiers, sized by arithmetic rather than by hope. Each destination is
              76px; brand and account controls are the fixed cost either side.

                640–1023  3 inline + More  ≈ 510px used  (fits 640)
                1024–1279 5 inline + More  ≈ 782px used  (fits 1024)
                ≥1280     all nine inline  ≈ 1010px used (fits 1280)

              Nothing scrolls horizontally at any width, which is the one property a
              fixed header has to have — a bar that overflows cannot be scrolled back to.
            */}
            <span className="flex items-center gap-0.5 lg:hidden">
              {destinations.slice(0, INLINE_AT_SMALL).map((item) => (
                <TopNavItem
                  key={item.href}
                  item={item}
                  active={isActive(item, effectivePath)}
                />
              ))}
              <MoreMenu
                items={destinations.slice(INLINE_AT_SMALL)}
                currentPath={effectivePath}
              />
            </span>

            <span className="hidden items-center gap-0.5 lg:flex xl:hidden">
              {inline.map((item) => (
                <TopNavItem
                  key={item.href}
                  item={item}
                  active={isActive(item, effectivePath)}
                />
              ))}
              <MoreMenu items={overflow} currentPath={effectivePath} />
            </span>

            <span className="hidden items-center gap-0.5 xl:flex">
              {destinations.map((item) => (
                <TopNavItem
                  key={item.href}
                  item={item}
                  active={isActive(item, effectivePath)}
                />
              ))}
            </span>
          </nav>

          <span aria-hidden className="mx-1 hidden h-9 w-px shrink-0 bg-border-glass lg:block" />

          {/* Account controls.
              No search field: this application has no global search — no index, no
              endpoint, no page — and a styled input that does nothing is the dead-control
              failure `tests/no-orphaned-actions.test.ts` exists to catch. */}
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-surface-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50"
            >
              <Bell className="size-5 text-pink-600 dark:text-pink-300" aria-hidden />
            </Link>
            <AccountMenu currentPath={effectivePath} />
          </div>
        </div>
      </header>

      {/* ── MOBILE HEADER ────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-(--shell-header-mobile) items-center justify-between border-b border-border-glass bg-linear-to-r from-accent-cyan/30 to-accent-blue/18 px-4 backdrop-blur-glass sm:hidden">
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
          {/* A LINK to /profile, deliberately NOT inside the sign-out form. */}
          <Button asChild variant="ghost" size="icon" className="size-9">
            <Link href="/profile" aria-label="Profile Screen">
              <User className="size-4 text-accent-blue-ink" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── MOBILE DRAWER ────────────────────────────────────────────────
          Lists every destination for the role, including the relocated ones — a phone
          has no header bar to hold them. */}
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
          {items.map((item) => {
            const active = isActive(item, effectivePath);
            const { ring } = visualFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 ${ring} ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-foreground/75 hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                <NavTile href={item.href} active={active} size="sm" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
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
 * route, because the failure it guards against is it vanishing on one page.
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
                <NavTile href={item.href} active={active} size="sm" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
