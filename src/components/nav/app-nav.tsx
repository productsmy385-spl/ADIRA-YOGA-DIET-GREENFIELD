import Link from "next/link";

import { GlassNavbar } from "@/components/glass/glass";
import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";

import { navItemsForRole, type NavItem, type NavRole } from "./nav-items";

/**
 * The application shell's navigation.
 *
 * A SERVER component. It takes the role from an already-resolved session rather than
 * fetching anything, which keeps the presentation layer free of authorization decisions —
 * `docs/ARCHITECTURE.md`, "Presentation layer".
 *
 * Hiding a link grants nothing. Every destination keeps its own guard; this list decides
 * what is convenient to reach, not what is permitted. See `nav-items.test.ts`.
 */

export interface AppNavProps {
  role: NavRole;
  /** For the active state. Compared by prefix so nested routes stay highlighted. */
  currentPath?: string;
}

function isActive(item: NavItem, currentPath?: string): boolean {
  if (!currentPath) return false;
  // Exact match for the root of a section, prefix for anything nested beneath it —
  // otherwise "/admin" would light up while viewing "/admin/analytics" and vice versa.
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

export function AppNav({ role, currentPath }: AppNavProps) {
  const items = navItemsForRole(role);

  return (
    <GlassNavbar>
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href={role === "CUSTOMER" || role === "USER" ? "/today" : "/admin"} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-7" />
          <span className="font-semibold tracking-tight text-foreground">
            {branding.name}
          </span>
        </Link>

        {/* Desktop. The mobile equivalent is the tab bar below, so this is hidden rather
            than reflowed — a horizontally scrolling nav bar on a phone is a nav bar
            people do not discover the end of. */}
        <ul className="hidden flex-1 items-center gap-1 sm:flex">
          {items.map((item) => (
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

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <ThemeToggle />
        </div>
      </div>
    </GlassNavbar>
  );
}

/**
 * Mobile tab bar.
 *
 * Fixed to the bottom, where a thumb reaches. Rendered alongside `AppNav`, which hides
 * its own link list below `sm`.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps it clear of the iOS home indicator — without
 * it the last few pixels of every tab are untappable on a modern iPhone, which is the
 * kind of bug that only appears on the device.
 */
export function MobileTabBar({ role, currentPath }: AppNavProps) {
  const items = navItemsForRole(role);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-glass bg-surface-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-glass sm:hidden"
    >
      <ul className="flex items-stretch">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={isActive(item, currentPath) ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center px-2 py-2 text-xs transition-colors ${
                isActive(item, currentPath)
                  ? "font-medium text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
