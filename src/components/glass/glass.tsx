import { cn } from "@/lib/utils";

/**
 * Glass primitives — Botanical Wellness Glass (docs/UX-SPECIFICATION.md).
 *
 * Glass is implemented HERE and nowhere else. A `backdrop-blur-[13px]` in a feature
 * component is the failure this module exists to prevent: once two components disagree
 * about the blur radius, the system has stopped being a system.
 *
 * THE TWO RULES THAT MATTER
 *
 * 1. **Text never sits on unbounded glass.** A glass surface's contrast depends on
 *    whatever happens to be behind it, which changes as the page scrolls — a card
 *    passing 4.5:1 over the hero can fail over a bright shape 200px later. So glass
 *    supplies the edge and the depth, and text sits on `--surface`, which is opaque and
 *    testable. `GlassCard` composes both; use it rather than hand-rolling.
 *
 * 2. **At most two blurred layers may overlap.** Stacked `backdrop-filter` is a real
 *    cost on the mid-range Android our customers use, and it surfaces as scroll jank
 *    rather than as an error. A dialog over a page is already two.
 */

export type GlassLevel = 1 | 2;

/** Level 1 — cards, list rows, sidebar. Level 2 — dialogs, sheets, popovers. */
const SURFACE: Record<GlassLevel, string> = {
  1: "bg-surface-glass backdrop-blur-glass border-border-glass",
  2: "bg-surface-glass-strong backdrop-blur-panel border-border-glass",
};

/**
 * The highlight along the top edge is what reads as "light passing through" rather than
 * "a translucent rectangle". It is the whole difference between this and a plain
 * semi-transparent box.
 */
const EDGE =
  "relative border shadow-[0_1px_0_0_var(--glass-highlight)_inset,0_8px_24px_-12px_var(--glass-shadow)]";

export interface GlassProps extends React.ComponentProps<"div"> {
  level?: GlassLevel;
}

/** Bare glass. Use when the children bring their own opaque surface. */
export function GlassPanel({ level = 1, className, ...props }: GlassProps) {
  return <div className={cn(EDGE, SURFACE[level], "rounded-xl", className)} {...props} />;
}

export interface GlassCardProps extends GlassProps {
  /**
   * Interactive cards lift on hover and brighten their border (elevation level 3).
   * Non-interactive ones must not — motion that does not communicate state is noise.
   */
  interactive?: boolean;
}

/**
 * A glass frame with an opaque inner surface for content.
 *
 * This is the component almost everything should use. The inner `bg-surface` is what
 * makes the text contrast-testable regardless of what scrolls behind the card.
 */
export function GlassCard({
  level = 1,
  interactive = false,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        EDGE,
        SURFACE[level],
        "rounded-xl p-px",
        interactive &&
          "transition-[transform,border-color] duration-[var(--duration-fast)] ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:border-primary/40",
        className,
      )}
      {...props}
    >
      <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface/85 p-5 text-surface-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * A metric tile.
 *
 * `value` is a string so the caller decides how to render an absent figure. It must be
 * `—` when a metric is undefined, never `0%` — `docs/METRICS.md`: rendering zero for a
 * customer who was given nothing to do is a lie that looks like a fact.
 *
 * Tabular numerals are not cosmetic. Without them a counting animation reflows the tile
 * on every frame.
 */
export function GlassMetric({
  label,
  value,
  hint,
  className,
  ...props
}: GlassProps & { label: string; value: string; hint?: string }) {
  return (
    <GlassCard className={className} {...props}>
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-surface-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </GlassCard>
  );
}

/**
 * Sticky top navigation.
 *
 * Level 1 only, and deliberately: it is already one blurred layer, and any dialog opened
 * over it is the second. A level-2 navbar would spend the entire blur budget before a
 * single card rendered.
 */
export function GlassNavbar({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border-glass bg-surface-glass backdrop-blur-glass",
        className,
      )}
      {...props}
    />
  );
}

export function GlassSidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "border-r border-border-glass bg-surface-glass backdrop-blur-glass",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A container for charts and other content that brings its own colours.
 *
 * Opaque inner surface, because a chart drawn over a moving background is unreadable and
 * its axis labels are the smallest text on the page.
 */
export function GlassChartContainer({ className, children, ...props }: GlassProps) {
  return (
    <GlassPanel className={cn("p-px", className)} {...props}>
      <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface p-4">{children}</div>
    </GlassPanel>
  );
}
