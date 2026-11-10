"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

import { TONE_CLASSES, visualFor } from "./nav-visuals";

/**
 * The navigation frame shared by the tenant console and the platform console
 * (brief Phases 9 and 11). One implementation, so the two can no longer drift — the
 * platform console's sidebar had come to sit on top of its own content because it was
 * built separately from the page offset.
 *
 *   ≥640px  collapsible sidebar (icon rail ↔ labelled) + slim header for account controls
 *   <640px  header, modal drawer with the full menu, fixed bottom bar with ≤5 destinations
 *
 * NOTHING HERE IS AUTHORIZATION. The items passed in are presentation; every route keeps
 * its own server-side guard (see nav-items.ts).
 */

export interface ShellItem {
  href: string;
  label: string;
}

export function isActive(item: { href: string }, currentPath?: string): boolean {
  if (!currentPath) return false;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

/**
 * The ONE current destination: the longest href that matches. Without this, `/admin`
 * (Caseload) prefix-matched every `/admin/...` page, so two items were marked current at
 * once — found by browser QA on /admin/website.
 */
export function activeHrefFor(items: readonly { href: string }[], currentPath?: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (isActive(item, currentPath) && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/* ── sidebar state ─────────────────────────────────────────────────────── */

const STORAGE_KEY = "adira-sidebar";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  return () => observer.disconnect();
}

/**
 * Read from the <html> attribute the pre-paint script set, not from React state, so the
 * first render already matches what is on screen. `null` on the server.
 */
function useSidebarExpanded(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.sidebar === "expanded",
    () => null,
  );
}

function setSidebar(next: "expanded" | "collapsed") {
  document.documentElement.dataset.sidebar = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the choice lasts for this page only, which is acceptable.
  }
}

/* ── pieces ────────────────────────────────────────────────────────────── */

export function NavTile({
  href,
  active,
  size = "md",
}: {
  href: string;
  active: boolean;
  size?: "md" | "sm";
}) {
  const { Icon, tone } = visualFor(href);
  const t = TONE_CLASSES[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl transition-colors duration-(--duration-fast)",
        size === "md" ? "size-9" : "size-8",
        active ? cn(t.active, "shadow-sm") : t.rest,
      )}
    >
      <Icon className={size === "md" ? "size-4.5" : "size-4"} />
    </span>
  );
}

/**
 * A sidebar destination. When the sidebar is a rail, the SAME label element becomes the
 * tooltip — so the link's accessible name never disappears, it only changes position.
 */
function SidebarLink({ item, active }: { item: ShellItem; active: boolean }) {
  const { ring } = TONE_CLASSES[visualFor(item.href).tone];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-xl px-2 py-1 text-sm font-semibold",
        "transition-colors duration-(--duration-fast) focus-visible:ring-2 focus-visible:outline-none",
        "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
        ring,
        active
          ? "bg-surface text-foreground shadow-xs"
          : "text-foreground/75 hover:bg-surface-glass hover:text-foreground",
      )}
    >
      {/* Active indicator: a bar on the leading edge, visible in both widths. */}
      {active ? (
        <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-primary" />
      ) : null}
      <NavTile href={item.href} active={active} />
      <span
        className={cn(
          "truncate",
          "sidebar-collapsed:pointer-events-none sidebar-collapsed:absolute sidebar-collapsed:left-full sidebar-collapsed:z-50",
          "sidebar-collapsed:ml-3 sidebar-collapsed:rounded-lg sidebar-collapsed:border sidebar-collapsed:border-border-glass",
          "sidebar-collapsed:bg-popover sidebar-collapsed:px-2.5 sidebar-collapsed:py-1.5 sidebar-collapsed:text-xs",
          "sidebar-collapsed:whitespace-nowrap sidebar-collapsed:text-popover-foreground sidebar-collapsed:shadow-lg",
          "sidebar-collapsed:opacity-0 sidebar-collapsed:transition-opacity",
          "sidebar-collapsed:group-hover:opacity-100 sidebar-collapsed:group-focus-visible:opacity-100",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function CollapseToggle() {
  const expanded = useSidebarExpanded();
  return (
    <button
      type="button"
      onClick={() => setSidebar(expanded ? "collapsed" : "expanded")}
      aria-controls="app-sidebar"
      aria-expanded={expanded ?? undefined}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-sm font-semibold text-foreground/70",
        "transition-colors hover:bg-surface-glass hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
      )}
    >
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/6">
        {expanded ? <PanelLeftClose className="size-4.5" /> : <PanelLeftOpen className="size-4.5" />}
      </span>
      <span className="sidebar-collapsed:sr-only">Collapse</span>
    </button>
  );
}

/* ── the drawer's modal behaviour ──────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * While open: focus moves in, Tab cycles inside, Escape closes, the page behind cannot
 * scroll. On close, focus returns to the button that opened it — without that a keyboard
 * user is dropped at the top of the document.
 */
function useModalDrawer(
  open: boolean,
  close: () => void,
  panel: React.RefObject<HTMLElement | null>,
  trigger: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const returnTo = trigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus();
    };
  }, [open, close, panel, trigger]);
}

/* ── the shell ─────────────────────────────────────────────────────────── */

export interface ConsoleShellProps {
  /** The full menu: sidebar and drawer. */
  items: ShellItem[];
  /** The bottom bar: at most five (asserted in nav-items.test.ts). */
  tabs: ShellItem[];
  home: string;
  subtitle: string;
  currentPath?: string;
  /** Right side of the desktop header — notifications, account menu. */
  headerActions: ReactNode;
  /** Right side of the mobile header. */
  mobileActions: ReactNode;
  /** Bottom of the drawer — theme, sign out. */
  drawerFooter: ReactNode;
  /** Routes where the bottom bar would obstruct a full-screen task. */
  hideTabsOn?: string[];
}

export function ConsoleShell({
  items,
  tabs,
  home,
  subtitle,
  currentPath,
  headerActions,
  mobileActions,
  drawerFooter,
  hideTabsOn = ["/experience"],
}: ConsoleShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(currentPath);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the drawer when the route changes (a link inside it was followed).
  if (currentPath !== prevPath) {
    setPrevPath(currentPath);
    setDrawerOpen(false);
  }

  const [closeDrawer] = useState(() => () => setDrawerOpen(false));
  useModalDrawer(drawerOpen, closeDrawer, drawerRef, triggerRef);

  const showTabs = !hideTabsOn.some((prefix) => currentPath?.startsWith(prefix));
  const activeItem = activeHrefFor(items, currentPath);
  const activeTab = activeHrefFor(tabs, currentPath);

  const brand = (size: "sm" | "md") => (
    // eslint-disable-next-line @next/next/no-img-element -- static brand mark
    <img
      src={branding.icons.mark}
      alt=""
      aria-hidden
      className={size === "md" ? "size-9 shrink-0" : "size-7 shrink-0"}
    />
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-(--shell-sidebar) flex-col sm:flex",
          "border-r border-border-glass bg-sidebar/92 backdrop-blur-glass",
          "transition-[width] duration-(--duration-normal) ease-(--ease-out-soft)",
        )}
      >
        <Link
          href={home}
          className="flex h-(--shell-header) shrink-0 items-center gap-2.5 border-b border-border-glass px-4 sidebar-collapsed:justify-center sidebar-collapsed:px-0"
        >
          {brand("md")}
          <span className="min-w-0 leading-tight sidebar-collapsed:sr-only">
            <span className="block truncate text-lg font-extrabold tracking-tight text-foreground">
              {branding.name}
            </span>
            <span className="block truncate text-[11px] font-medium text-foreground/60">{subtitle}</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sidebar-collapsed:overflow-visible"
        >
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} active={item.href === activeItem} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-border-glass p-3">
          <CollapseToggle />
        </div>
      </aside>

      {/* ── DESKTOP HEADER ──────────────────────────────────────────────── */}
      <header
        aria-label="Application header"
        className={cn(
          "fixed top-0 right-0 left-(--shell-sidebar) z-30 hidden h-(--shell-header) items-center justify-end gap-1",
          "border-b border-border-glass bg-linear-to-r from-accent-cyan/22 via-accent-blue/12 to-accent-green/14",
          "px-4 backdrop-blur-glass sm:flex lg:px-6",
          "transition-[left] duration-(--duration-normal) ease-(--ease-out-soft)",
        )}
      >
        {headerActions}
      </header>

      {/* ── MOBILE HEADER ───────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-(--shell-header-mobile) items-center justify-between border-b border-border-glass bg-linear-to-r from-accent-cyan/30 to-accent-blue/18 px-4 backdrop-blur-glass sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            className="size-10 text-foreground"
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <Link href={home} className="flex min-w-0 items-center gap-2">
            {brand("sm")}
            <span className="truncate text-sm font-extrabold tracking-tight text-foreground">
              {branding.name}
            </span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1">{mobileActions}</div>
      </header>

      {/* ── MOBILE DRAWER (modal) ───────────────────────────────────────── */}
      {drawerOpen ? (
        <div
          aria-hidden
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm sm:hidden"
        />
      ) : null}
      <aside
        ref={drawerRef}
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation Drawer"
        inert={!drawerOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-80 flex-col border-r border-border-glass bg-background shadow-2xl sm:hidden",
          "pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))]",
          "transition-transform duration-(--duration-normal) ease-(--ease-out-soft)",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border-glass px-4 py-3">
          <Link href={home} onClick={() => setDrawerOpen(false)} className="flex items-center gap-2.5">
            {brand("sm")}
            <span className="text-base font-extrabold tracking-tight text-foreground">{branding.name}</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="size-10"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        <nav aria-label="Menu" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {items.map((item) => {
            const active = item.href === activeItem;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition-colors",
                  "focus-visible:ring-2 focus-visible:outline-none",
                  TONE_CLASSES[visualFor(item.href).tone].ring,
                  active ? "bg-muted text-foreground" : "text-foreground/75 hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <NavTile href={item.href} active={active} size="sm" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border-glass px-3 pt-3">{drawerFooter}</div>
      </aside>

      {/* ── MOBILE BOTTOM BAR (Palette-style) ───────────────────────────── */}
      {showTabs ? (
        <nav
          aria-label="Mobile Navigation Bar"
          className="fixed inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 rounded-3xl border border-border-glass bg-surface-glass-strong shadow-lg backdrop-blur-glass sm:hidden"
        >
          <ul className="flex items-stretch justify-around px-1 py-1">
            {tabs.slice(0, 5).map((item) => {
              const active = item.href === activeTab;
              return (
                <li key={item.href} className="min-w-0 flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1",
                      "text-[10px] font-semibold transition-colors duration-(--duration-fast)",
                      "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      active ? "bg-surface text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <NavTile href={item.href} active={active} size="sm" />
                    <span className="w-full truncate text-center">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
