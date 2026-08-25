import Link from "next/link";

import { GlassNavbar } from "@/components/glass/glass";
import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";

import { PLATFORM_NAV, type NavItem } from "./nav-items";

/**
 * The platform console's navigation — the PLATFORM identity domain (ADR-001).
 *
 * Deliberately a SEPARATE component from `AppNav` rather than a role branch inside it.
 * The two domains read different cookies, signed with different secrets, against
 * different tables, and a single component taking "role or platform" would be one
 * refactor away from a tenant session rendering a platform menu. They do not share a
 * code path, so that mistake has nowhere to happen.
 *
 * As with `AppNav`: hiding a link grants nothing. Every destination below is guarded by
 * `requirePlatformSession` on the server.
 */

function isActive(item: NavItem, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

export function PlatformNav({ currentPath }: { currentPath?: string }) {
  return (
    <GlassNavbar>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/super-admin" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-7" />
          <span className="font-semibold tracking-tight text-foreground">
            {branding.name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">platform</span>
          </span>
        </Link>

        <ul className="flex flex-1 flex-wrap items-center gap-1">
          {PLATFORM_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item, currentPath) ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] ${
                  isActive(item, currentPath)
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <ThemeToggle />
      </div>
    </GlassNavbar>
  );
}
