import Link from "next/link";
import { Building2, FileKey, Fingerprint, LayoutDashboard } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";
import { PLATFORM_NAV, type NavItem } from "./nav-items";

function isActive(item: NavItem, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

function getPlatformNavIcon(href: string) {
  switch (href) {
    case "/super-admin":
      return LayoutDashboard;
    case "/super-admin/organizations":
      return Building2;
    case "/super-admin/admins":
      return FileKey;
    case "/super-admin/audit":
      return Fingerprint;
    default:
      return LayoutDashboard;
  }
}

export function PlatformNav({ currentPath }: { currentPath?: string }) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden sm:flex fixed inset-y-0 left-0 z-30 w-[260px] flex-col border-r border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-6 border-b border-border/40">
          <Link href="/super-admin" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-7 mix-blend-multiply dark:mix-blend-screen" />
            <span className="font-semibold tracking-tight text-foreground">
              {branding.name}
              <span className="ml-1 text-xs font-normal text-muted-foreground">platform</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          {PLATFORM_NAV.map((item) => {
            const active = isActive(item, currentPath);
            const Icon = getPlatformNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/40 space-y-2">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="sm:hidden fixed top-0 inset-x-0 z-30 flex h-14 items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Link href="/super-admin" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-6 mix-blend-multiply dark:mix-blend-screen" />
          <span className="font-semibold tracking-tight text-foreground">
            {branding.name}
            <span className="ml-1 text-xs font-normal text-muted-foreground">platform</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Platform Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden supports-[backdrop-filter]:bg-background/80"
      >
        <ul className="flex items-stretch justify-around">
          {PLATFORM_NAV.map((item) => {
            const Icon = getPlatformNavIcon(item.href);
            const active = isActive(item, currentPath);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[10px] transition-all duration-200 active:scale-95 ${
                    active
                      ? "font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div
                    className={`flex size-7 items-center justify-center rounded-full transition-colors ${
                      active ? "bg-primary/15 text-primary" : ""
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
    </>
  );
}
