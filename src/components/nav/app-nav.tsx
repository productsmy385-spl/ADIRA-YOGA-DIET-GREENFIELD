"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, User } from "lucide-react";

import { signOutAction } from "@/app/sign-in/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import { ConsoleShell, NavTile, isActive } from "./console-shell";
import { homeForRole, navItemsForRole, primaryNavForRole, type NavRole } from "./nav-items";

/**
 * Tenant console navigation: a collapsible sidebar on desktop, a modal drawer and a
 * role-aware bottom bar on phones (brief Phases 9 and 11). The frame is `ConsoleShell`,
 * shared with the platform console.
 *
 * Fixed in this version:
 *  - The bottom bar used two HARD-CODED tab sets, so TRAINER and STAFF were offered the
 *    admin tabs, including Members — a page they are refused. It now uses
 *    `primaryNavForRole`, the per-role list that already existed and was not wired in.
 *  - The brand mark sent TRAINER and STAFF to `/admin`; it now uses `homeForRole`.
 *  - Seventeen pages rendered `<MobileTabBar>` themselves on top of the one AppNav renders,
 *    stacking two bars. AppNav is now the only place the bar is rendered.
 *
 * NOTHING HERE IS AUTHORIZATION — see nav-items.ts.
 */

export interface AppNavProps {
  role: NavRole;
  currentPath?: string;
}

/**
 * Profile, Theme and Sign out, kept visibly separate.
 *
 * Profile is a LINK and Sign out is a form SUBMIT — the account control once sat inside
 * the sign-out form, so tapping it logged the user out. `app-nav.test.tsx` asserts the
 * profile link has no ancestor form.
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
        className="flex min-h-11 items-center gap-2 rounded-2xl px-1.5 py-1 transition-colors hover:bg-surface-glass focus-visible:ring-2 focus-visible:ring-accent-blue/50 focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-accent-violet text-accent-violet-fg"
        >
          <User className="size-4" />
        </span>
        <ChevronDown className="size-4 text-foreground/60" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-56 rounded-2xl border border-border-glass bg-popover p-2 shadow-xl"
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

          <SignOutButton role="menuitem" />
        </div>
      )}
    </div>
  );
}

/** The ONLY control that ends the session, always in its own form. */
function SignOutButton({ role }: { role?: "menuitem" }) {
  return (
    <form action={signOutAction} className="w-full">
      <button
        type="submit"
        role={role}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-accent-red/10 hover:text-accent-red-ink focus-visible:ring-2 focus-visible:ring-accent-red/50 focus-visible:outline-none"
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
  );
}

function NotificationsLink({ size }: { size: "md" | "sm" }) {
  return (
    <Link
      href="/notifications"
      aria-label="Notifications"
      className={`relative flex items-center justify-center rounded-xl transition-colors hover:bg-surface-glass focus-visible:ring-2 focus-visible:ring-accent-pink/50 focus-visible:outline-none ${
        size === "md" ? "size-11" : "size-10"
      }`}
    >
      <Bell className={`${size === "md" ? "size-5" : "size-4.5"} text-accent-pink-ink`} aria-hidden />
    </Link>
  );
}

export function AppNav({ role, currentPath }: AppNavProps) {
  const pathname = usePathname();
  const effectivePath = currentPath || pathname;

  return (
    <ConsoleShell
      items={navItemsForRole(role)}
      tabs={primaryNavForRole(role)}
      home={homeForRole(role)}
      subtitle="Wellness in Balance"
      currentPath={effectivePath}
      headerActions={
        <>
          <NotificationsLink size="md" />
          <AccountMenu currentPath={effectivePath} />
        </>
      }
      mobileActions={
        <>
          <NotificationsLink size="sm" />
          {/* A LINK to /profile, deliberately NOT inside the sign-out form. */}
          <Button asChild variant="ghost" size="icon" className="size-10">
            <Link href="/profile" aria-label="Profile">
              <User className="size-4.5 text-accent-blue-ink" aria-hidden />
            </Link>
          </Button>
        </>
      }
      drawerFooter={
        <>
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-foreground/70">Theme</span>
            <ThemeToggle />
          </div>
          <SignOutButton />
        </>
      }
    />
  );
}
