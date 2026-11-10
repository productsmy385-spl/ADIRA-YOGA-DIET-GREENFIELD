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
          "relative mx-auto w-full px-(--page-gutter) pt-(--section-gap) pb-28 md:px-(--page-gutter-md) md:pt-(--section-gap-lg) sm:pb-10 lg:px-(--page-gutter-lg)",
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
