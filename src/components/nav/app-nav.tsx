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
  KeyRound,
  LayoutDashboard,
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

import {
  navItemsForRole,
  type NavItem,
  type NavRole,
} from "./nav-items";

export interface AppNavProps {
  role: NavRole;
  currentPath?: string;
}

function isActive(item: NavItem, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

/**
 * Nav icon + colour, per destination.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY EACH ROUTE CARRIES A HUE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every nav item used to render `text-muted-foreground` and became `text-primary` when
 * active — one green, eighteen destinations. In a sidebar that long, colour is the only
 * thing that makes an item findable at a glance without reading it, and a single hue
 * throws that away.
 *
 * The hues are the product's own domain language, not decoration: yoga is emerald,
 * nutrition amber, rest indigo, analysis sky, requests orange. They match the custom
 * icon set in `@/components/icons`, which already colours itself this way — so the two
 * systems agree instead of quietly diverging.
 *
 * These are Tailwind utility classes, not colour VALUES. Invariant 7 forbids a hex
 * literal in `src/`; it does not forbid a palette utility, and expressing 18 tints as
 * tokens in `globals.css` would add 54 declarations used in exactly one file.
 */
interface NavVisual {
  Icon: typeof LayoutDashboard;
  /** Idle: tinted glass tile. Active: saturated, so the current page is unmistakable. */
  idle: string;
  active: string;
}

const DEFAULT_VISUAL: NavVisual = {
  Icon: LayoutDashboard,
  idle: "border-brand-500/25 bg-brand-500/10 text-primary",
  active: "border-transparent bg-primary text-primary-foreground",
};

const NAV_VISUALS: Record<string, NavVisual> = {
  "/today": {
    Icon: CalendarCheck,
    idle: "border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    active: "border-transparent bg-emerald-600 text-white",
  },
  "/progress": {
    Icon: TrendingUp,
    idle: "border-violet-500/25 bg-violet-500/12 text-violet-600 dark:text-violet-400",
    active: "border-transparent bg-violet-600 text-white",
  },
  "/reports": {
    Icon: FileText,
    idle: "border-purple-500/25 bg-purple-500/12 text-purple-600 dark:text-purple-400",
    active: "border-transparent bg-purple-600 text-white",
  },
  "/admin/reports": {
    Icon: FileText,
    idle: "border-purple-500/25 bg-purple-500/12 text-purple-600 dark:text-purple-400",
    active: "border-transparent bg-purple-600 text-white",
  },
  "/notifications": {
    Icon: Bell,
    idle: "border-pink-500/25 bg-pink-500/12 text-pink-600 dark:text-pink-400",
    active: "border-transparent bg-pink-600 text-white",
  },
  "/profile": {
    Icon: User,
    idle: "border-blue-500/25 bg-blue-500/12 text-blue-600 dark:text-blue-400",
    active: "border-transparent bg-blue-600 text-white",
  },
  "/admin": {
    Icon: LayoutDashboard,
    idle: "border-indigo-500/25 bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
    active: "border-transparent bg-indigo-600 text-white",
  },
  "/dashboard": {
    Icon: LayoutDashboard,
    idle: "border-indigo-500/25 bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
    active: "border-transparent bg-indigo-600 text-white",
  },
  "/admin/access-requests": {
    Icon: KeyRound,
    idle: "border-orange-500/25 bg-orange-500/12 text-orange-600 dark:text-orange-400",
    active: "border-transparent bg-orange-600 text-white",
  },
  "/admin/members": {
    Icon: Users,
    idle: "border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    active: "border-transparent bg-emerald-600 text-white",
  },
  "/admin/team": {
    Icon: Users,
    idle: "border-teal-500/25 bg-teal-500/12 text-teal-600 dark:text-teal-400",
    active: "border-transparent bg-teal-600 text-white",
  },
  "/trainer": {
    Icon: Users,
    idle: "border-teal-500/25 bg-teal-500/12 text-teal-600 dark:text-teal-400",
    active: "border-transparent bg-teal-600 text-white",
  },
  "/staff": {
    Icon: Users,
    idle: "border-teal-500/25 bg-teal-500/12 text-teal-600 dark:text-teal-400",
    active: "border-transparent bg-teal-600 text-white",
  },
  "/admin/programmes": {
    Icon: CalendarPlus,
    idle: "border-cyan-500/25 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
    active: "border-transparent bg-cyan-600 text-white",
  },
  "/admin/yoga": {
    Icon: Activity,
    idle: "border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    active: "border-transparent bg-emerald-600 text-white",
  },
  "/admin/diet": {
    Icon: Salad,
    idle: "border-amber-500/25 bg-amber-500/12 text-amber-600 dark:text-amber-400",
    active: "border-transparent bg-amber-600 text-white",
  },
  "/admin/analytics": {
    Icon: BarChart3,
    idle: "border-sky-500/25 bg-sky-500/12 text-sky-600 dark:text-sky-400",
    active: "border-transparent bg-sky-600 text-white",
  },
};

function visualFor(href: string): NavVisual {
  return NAV_VISUALS[href] ?? DEFAULT_VISUAL;
}

/**
 * The glass tile an icon sits in.
 *
 * A translucent tinted square with a hairline border reads as depth at 32px in a way a
 * bare stroke icon does not, and it gives the active state somewhere to go that is not
 * "the same icon, greener".
 */
function NavIcon({
  href,
  active,
  size = "md",
}: {
  href: string;
  active: boolean;
  size?: "md" | "sm";
}) {
  const { Icon, idle, active: activeTone } = visualFor(href);

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg border backdrop-blur-xs transition-all duration-(--duration-fast) ${
        size === "md" ? "size-8" : "size-7"
      } ${active ? `${activeTone} shadow-sm` : idle}`}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} />
    </span>
  );
}

export function AppNav({ role, currentPath }: AppNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const items = navItemsForRole(role);
  const effectivePath = currentPath || pathname;
  const [prevPath, setPrevPath] = useState(effectivePath);

  // Auto-close drawer on route navigation
  if (effectivePath !== prevPath) {
    setPrevPath(effectivePath);
    setDrawerOpen(false);
  }

  // Handle ESC key press to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    if (drawerOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [drawerOpen]);

  return (
    <>
      {/* Desktop Fixed Sidebar (>= 768px / sm breakpoint) */}
      <aside
        aria-label="Desktop Navigation Sidebar"
        className="hidden sm:flex fixed inset-y-0 left-0 z-40 w-[260px] flex-col border-r border-border/40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 shadow-xs"
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-border/40">
          <Link
            href={role === "CUSTOMER" || role === "USER" ? "/today" : "/admin"}
            className="flex items-center gap-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-7 mix-blend-multiply dark:mix-blend-screen shrink-0"
            />
            <span className="font-semibold tracking-tight text-foreground text-base">
              {branding.name}
            </span>
          </Link>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {items.map((item) => {
            const active = isActive(item, effectivePath);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-(--duration-fast) ${
                  active
                    ? "bg-primary/10 font-semibold text-primary shadow-2xs"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                <NavIcon href={item.href} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Fixed Bottom Utility Area */}
        <div className="p-3 border-t border-border/40 bg-muted/20 space-y-1">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <NavIcon href="/profile" active={isActive({ href: "/profile", label: "Profile", labelKey: "" }, effectivePath)} />
            <span>Profile</span>
          </Link>
          <form action={signOutAction} className="w-full">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile Top Header (< 768px / sm breakpoint) */}
      <header className="sm:hidden fixed top-0 inset-x-0 z-40 flex h-14 items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 shadow-2xs">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="size-9 text-foreground hover:bg-muted"
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <Link
            href={role === "CUSTOMER" || role === "USER" ? "/today" : "/admin"}
            className="flex items-center gap-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-6 mix-blend-multiply dark:mix-blend-screen shrink-0"
            />
            <span className="font-semibold tracking-tight text-foreground text-sm">
              {branding.name}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            <Link href="/notifications" aria-label="Notifications">
              <Bell className="size-4" aria-hidden />
            </Link>
          </Button>
          <ThemeToggle />
          {/* FIXED: Profile button links to /profile. NO LOGOUT! */}
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            <Link href="/profile" aria-label="Profile Screen">
              <User className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      {/* Mobile Slide-Out Navigation Drawer / Sheet */}
      {drawerOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        aria-label="Mobile Navigation Drawer"
        className={`sm:hidden fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-[320px] flex-col border-r border-border/40 bg-background p-4 backdrop-blur-xl shadow-2xl transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <Link
            href={role === "CUSTOMER" || role === "USER" ? "/today" : "/admin"}
            className="flex items-center gap-2.5"
            onClick={() => setDrawerOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.icons.mark}
              alt=""
              aria-hidden
              className="size-7 mix-blend-multiply dark:mix-blend-screen shrink-0"
            />
            <span className="font-semibold tracking-tight text-foreground text-base">
              {branding.name}
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Scrollable Role-Based Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {items.map((item) => {
            const active = isActive(item, effectivePath);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 font-semibold text-primary shadow-2xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <NavIcon href={item.href} active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Utility Area */}
        <div className="pt-3 border-t border-border/40 space-y-2">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <form action={signOutAction} className="w-full">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Persistent Mobile Bottom Navigation Bar (ALWAYS MOUNTED FOR MOBILE) */}
      <MobileTabBar role={role} currentPath={effectivePath} />
    </>
  );
}

/**
 * 📱 Mobile Bottom Navigation Bar (5 Primary Destinations with Center '+' Action)
 */
export function MobileTabBar({ role, currentPath }: AppNavProps) {
  const isMember = role === "CUSTOMER" || role === "USER";

  const mobileNavItems = isMember
    ? [
        { href: "/today", label: "Today", Icon: CalendarCheck },
        { href: "/progress", label: "Progress", Icon: TrendingUp },
        { href: "/experience/yoga", label: "Practice", isCenter: true, Icon: Plus },
        { href: "/notifications", label: "Alerts", Icon: Bell },
        { href: "/profile", label: "Profile", Icon: User },
      ]
    : [
        { href: "/admin", label: "Caseload", Icon: LayoutDashboard },
        { href: "/admin/programmes", label: "Plans", Icon: CalendarPlus },
        { href: "/admin/yoga", label: "Add", isCenter: true, Icon: Plus },
        { href: "/admin/members", label: "Members", Icon: Users },
        { href: "/profile", label: "Profile", Icon: User },
      ];

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md sm:hidden supports-[backdrop-filter]:bg-background/85 shadow-lg"
    >
      <ul className="flex items-center justify-around px-2">
        {mobileNavItems.map((item) => {
          const active = isActive({ href: item.href, label: item.label, labelKey: "" }, currentPath);

          if (item.isCenter) {
            return (
              <li key={item.href} className="flex shrink-0 items-center justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-200 active:scale-90"
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
                className={`flex min-h-12 flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-all duration-(--duration-fast) active:scale-95 motion-reduce:active:scale-100 ${
                  active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <NavIcon href={item.href} active={active} size="sm" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
