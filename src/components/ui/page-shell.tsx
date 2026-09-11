import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The page container every console route shares: decorative ground, one content panel.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SHARED COMPONENT RATHER THAN PER-PAGE MARKUP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Seventeen pages previously hand-rolled `<main className="mx-auto max-w-4xl …">`. They
 * had already drifted — different max-widths, different padding, one using `bg-canvas`
 * where the rest used `bg-background`. Composition repeated by hand diverges; composition
 * behind one component cannot.
 *
 * ── The panel is what keeps the colour readable ────────────────────────────────
 * The section washes in `globals.css` are atmosphere, and text must not sit on them
 * directly. Content lives on an opaque-ish `--surface` panel floating above the wash, so
 * contrast is a property of the panel rather than of wherever a gradient happens to be
 * strongest — which changes as the page scrolls and cannot be contrast-tested.
 */

export interface PageShellProps {
  children: ReactNode;
  /**
   * One of the `env-*` classes from `globals.css` — the section's colour environment.
   * Omitted, the page falls back to the neutral console wash.
   */
  env?: string;
  /** Content width. Tables want more room than forms. */
  width?: "narrow" | "default" | "wide";
  className?: string;
}

const WIDTH = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
} as const;

/**
 * The soft organic shapes.
 *
 * Pure CSS: two blurred radial blobs and a large translucent circle, `aria-hidden` and
 * `pointer-events-none`. No image asset, no WebGL, nothing animated — this sits behind
 * every page in the product, so it has to cost effectively nothing, and a decorative
 * element that intercepts clicks is a bug waiting to be reported as "the button is dead".
 */
function Decoration() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -right-32 bottom-[-10rem] size-[34rem] rounded-full bg-linear-to-br from-accent-cyan/22 to-accent-blue/10 blur-3xl" />
      <span className="absolute -right-10 bottom-[-4rem] size-72 rounded-full border border-accent-cyan/20 bg-accent-cyan/8" />
      <span className="absolute -left-40 top-40 size-96 rounded-full bg-linear-to-tr from-accent-green/14 to-transparent blur-3xl" />
    </div>
  );
}

export function PageShell({
  children,
  env,
  width = "default",
  className,
}: PageShellProps) {
  return (
    <div className={cn("relative", env ?? "app-canvas")}>
      <Decoration />

      {/* `pb-28 sm:pb-10` clears the mobile bottom tab bar, which is fixed and would
          otherwise cover the last row of any table. */}
      <main
        className={cn(
          "relative mx-auto w-full px-4 py-8 pb-28 sm:px-6 sm:pb-10",
          WIDTH[width],
          className,
        )}
      >
        <div className="rounded-3xl border border-border-glass bg-surface-glass-strong p-5 shadow-sm backdrop-blur-glass sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/* ── statistics ────────────────────────────────────────────────────────── */

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  /** `green` | `blue` | `orange` | `violet` — the meaning, not the decoration. */
  tone: keyof typeof STAT_TONES;
}

const STAT_TONES = {
  green: {
    panel: "border-accent-green/25 bg-accent-green/8",
    tile: "bg-accent-green text-accent-green-fg",
    value: "text-accent-green-ink",
  },
  blue: {
    panel: "border-accent-blue/25 bg-accent-blue/8",
    tile: "bg-accent-blue text-accent-blue-fg",
    value: "text-accent-blue-ink",
  },
  orange: {
    panel: "border-orange-500/25 bg-orange-500/8",
    tile: "bg-orange-500 text-white",
    value: "text-orange-700 dark:text-orange-300",
  },
  violet: {
    panel: "border-violet-500/25 bg-violet-500/8",
    tile: "bg-violet-600 text-white",
    value: "text-violet-700 dark:text-violet-300",
  },
} as const;

/**
 * A single headline number.
 *
 * The LABEL is uppercase and the value is large, because these are read at a glance and
 * the number is the thing being glanced at. The tone is chosen for meaning — green for a
 * total in good standing, orange for something waiting on a human — so the colour says
 * the same thing as the words rather than decorating them.
 */
export function StatTile({ label, value, hint, icon, tone }: StatTileProps) {
  const t = STAT_TONES[tone];
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-4", t.panel)}>
      <span
        aria-hidden
        className={cn(
          "flex size-11 items-center justify-center rounded-xl shadow-sm [&_svg]:size-5",
          t.tile,
        )}
      >
        {icon}
      </span>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-foreground/60">
        {label}
      </p>
      <p className={cn("mt-0.5 text-3xl font-extrabold tabular-nums", t.value)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-foreground/60">{hint}</p> : null}
    </div>
  );
}

/** The row these sit in. Two columns on a phone, four from `sm` up. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</div>;
}
