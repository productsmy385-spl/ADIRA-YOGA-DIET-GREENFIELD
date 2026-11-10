import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MetricCard / MetricGrid — the ONE way a headline number is shown (brief Phase 3).
 *
 * Five separate metric components had grown across the dashboards (`Metric`, three
 * `Stat`s and `StatTile`), each with its own padding, radius and type scale, which is why
 * rows did not line up. This replaces all of them.
 *
 * HOW ALIGNMENT IS GUARANTEED, rather than hoped for:
 *
 *   1. The header row (icon + label) has a fixed height equal to the icon tile, and the
 *      label is clamped to two lines inside it. A label that wraps therefore never pushes
 *      its number down — every value in a row starts on the same baseline.
 *   2. The card is a full-height flex column and the description is pushed to the bottom
 *      with `mt-auto`, so a card with a long description and one with none still end on
 *      the same line. The grid stretches every card in a row to the tallest one.
 *   3. No fixed card height anywhere: a fixed height is what clips text at 360px.
 *
 * Values are never invented (brief rule 13). `null` means "not available" and renders as
 * an em dash with an accessible label, never as a misleading 0.
 */

const TONES = {
  green: { tile: "bg-accent-green text-accent-green-fg", value: "text-accent-green-ink", wash: "from-accent-green/10" },
  blue: { tile: "bg-accent-blue text-accent-blue-fg", value: "text-accent-blue-ink", wash: "from-accent-blue/10" },
  turquoise: { tile: "bg-accent-cyan text-accent-cyan-fg", value: "text-accent-cyan-ink", wash: "from-accent-cyan/10" },
  orange: { tile: "bg-accent-orange text-accent-orange-fg", value: "text-accent-orange-ink", wash: "from-accent-orange/10" },
  violet: { tile: "bg-accent-violet text-accent-violet-fg", value: "text-accent-violet-ink", wash: "from-accent-violet/10" },
  pink: { tile: "bg-accent-pink text-accent-pink-fg", value: "text-accent-pink-ink", wash: "from-accent-pink/10" },
  red: { tile: "bg-accent-red text-accent-red-fg", value: "text-accent-red-ink", wash: "from-accent-red/10" },
} as const;

export type MetricTone = keyof typeof TONES;

export interface MetricTrend {
  /** Pre-formatted, e.g. "+12%". Computed by the caller from real data. */
  value: string;
  direction: "up" | "down" | "flat";
  /** e.g. "vs last week". */
  period?: string;
}

export interface MetricCardProps {
  label: string;
  /** `null` = not available. Never substitute 0 for a value that was not measured. */
  value: number | string | null;
  icon: ReactNode;
  tone?: MetricTone;
  description?: string;
  trend?: MetricTrend;
  /** The whole card becomes a link — for "go to the list behind this number". */
  href?: string;
  /**
   * The number needs a human's attention (e.g. pending requests > 0). Shown in the red
   * ink AND stated in the accessible name, so it is not conveyed by colour alone.
   */
  attention?: boolean;
}

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

export function MetricCard({
  label,
  value,
  icon,
  tone = "green",
  description,
  trend,
  href,
  attention = false,
}: MetricCardProps) {
  const t = TONES[tone];
  const unavailable = value === null;
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  const body = (
    <>
      <div className="flex h-11 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm [&_svg]:size-5",
            t.tile,
          )}
        >
          {icon}
        </span>
        <p className="line-clamp-2 text-xs/4 font-bold tracking-wide text-foreground/70 uppercase">
          {label}
        </p>
      </div>

      <p
        className={cn(
          "mt-3 truncate text-3xl/none font-extrabold tabular-nums",
          unavailable ? "text-muted-foreground" : attention ? "text-accent-red-ink" : t.value,
        )}
      >
        {unavailable ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          value
        )}
        {attention && !unavailable ? <span className="sr-only"> — needs attention</span> : null}
      </p>

      {(description || trend) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-foreground/65">
          {trend && TrendIcon ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-foreground/80">
              <TrendIcon aria-hidden className="size-3.5" />
              {trend.value}
              {trend.period ? <span className="font-normal text-foreground/65">&nbsp;{trend.period}</span> : null}
            </span>
          ) : null}
          {description ? <span>{description}</span> : null}
        </div>
      )}
    </>
  );

  const className = cn(
    "relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border-glass",
    "bg-linear-to-br to-transparent bg-surface p-4 shadow-xs sm:p-5",
    t.wash,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          className,
          "transition-[transform,box-shadow] duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-md",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

/**
 * The grid every metric row sits in.
 *
 * Mobile: one column below 400px (a 360px phone cannot fit two readable 3xl numbers),
 * two from 400px. Tablet: three. Desktop: four, or five where `columns={5}`.
 * Grid items stretch by default, which is what gives equal-height cards.
 */
export function MetricGrid({
  children,
  columns = 4,
  label,
  className,
}: {
  children: ReactNode;
  columns?: 3 | 4 | 5;
  /** Accessible name for the region, e.g. "Organisation at a glance". */
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 lg:gap-5",
        columns === 3 && "md:grid-cols-3",
        columns === 4 && "md:grid-cols-3 xl:grid-cols-4",
        columns === 5 && "md:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
