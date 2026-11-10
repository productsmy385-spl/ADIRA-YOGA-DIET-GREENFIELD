import { LogOut } from "lucide-react";

import { signOutPlatformAction } from "@/app/super-admin/actions";
import { ThemeToggle } from "@/components/theme-toggle";

import { ConsoleShell } from "./console-shell";
import { PLATFORM_NAV } from "./nav-items";

/**
 * Platform console navigation (ADR-001: a separate identity domain).
 *
 * Built on the same `ConsoleShell` as the tenant console. Its previous sidebar was a
 * fixed 260px column with no matching page offset, so it covered the left edge of every
 * platform page; the shared shell reads one width token for both, so that cannot recur.
 *
 * NOTHING HERE IS AUTHORIZATION: `requirePlatformSession` guards every platform route.
 */

function SignOut() {
  return (
    <form action={signOutPlatformAction}>
      <button
        type="submit"
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

export function PlatformNav({ currentPath }: { currentPath?: string }) {
  return (
    <ConsoleShell
      items={PLATFORM_NAV}
      tabs={PLATFORM_NAV}
      home="/super-admin"
      subtitle="Platform console"
      currentPath={currentPath}
      headerActions={
        <>
          <ThemeToggle />
          <div className="w-36">
            <SignOut />
          </div>
        </>
      }
      mobileActions={<ThemeToggle />}
      drawerFooter={<SignOut />}
    />
  );
}
