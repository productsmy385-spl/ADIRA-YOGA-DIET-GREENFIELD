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

function getNavIcon(href: string) {
  switch (href) {
    case "/today":
      return CalendarCheck;
    case "/progress":
      return TrendingUp;
    case "/reports":
    case "/admin/reports":
      return FileText;
    case "/notifications":
      return Bell;
    case "/profile":
      return User;
    case "/admin":
    case "/dashboard":
      return LayoutDashboard;
    case "/admin/access-requests":
      return KeyRound;
    case "/admin/members":
    case "/trainer":
    case "/staff":
    case "/admin/team":
      return Users;
    case "/admin/programmes":
      return CalendarPlus;
    case "/admin/yoga":
      return Activity;
    case "/admin/diet":
      return Salad;
    case "/admin/analytics":
      return BarChart3;
    default:
      return LayoutDashboard;
  }
}

export function AppNav({ role, currentPath }: AppNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const items = navItemsForRole(role);
  const effectivePath = currentPath || pathname;

  // Auto-close drawer on route navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [effectivePath]);

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
            const Icon = getNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
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
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <User className="size-4 shrink-0" aria-hidden />
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
            const Icon = getNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
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
          const Icon = item.Icon;

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
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-all duration-200 active:scale-95 ${
                  active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div
                  className={`flex size-6 items-center justify-center rounded-full transition-colors ${
                    active ? "text-primary" : ""
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                </div>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
