import type { ReactNode } from "react";

import { GlassPanel } from "@/components/glass/glass";
import { cn } from "@/lib/utils";

/**
 * The four states every data surface owes the reader (B7–B9).
 *
 * Loading, empty, error and — where it applies — success. They live here so that each
 * surface picks one rather than inventing its own, and so that the rules below cannot be
 * quietly dropped by whoever is in a hurry.
 */

/**
 * A skeleton.
 *
 * DELIBERATELY SHAPED LIKE THE THING IT REPLACES. A skeleton whose dimensions differ
 * from the real content makes the page jump when data lands, which is worse than showing
 * nothing — the reader's eye has already settled somewhere and it moves.
 *
 * `aria-hidden` with a live region owned by the parent: a screen reader should hear
 * "loading", not a description of grey rectangles.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * A loading region.
 *
 * `aria-busy` plus a polite live region so the wait is announced once. `label` describes
 * what is loading — "Loading today's activities", never "Loading" — because a person
 * using a screen reader on a page with three loading regions otherwise hears the same
 * word three times and learns nothing.
 */
export function LoadingState({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A metric tile's skeleton — matches `GlassMetric`'s dimensions exactly. */
export function MetricSkeleton() {
  return (
    <GlassPanel className="p-px">
      <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface/85 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-16" />
      </div>
    </GlassPanel>
  );
}

/** A list row's skeleton. `rows` should match the expected count where it is known. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <GlassPanel key={i} className="p-px">
          <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface/85 p-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-2/3" />
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}

/**
 * An empty state.
 *
 * `reason` is REQUIRED and is the whole point of the component. J2 names the failure
 * precisely: an empty state must distinguish "nothing here yet" from "something went
 * wrong", because a reader who cannot tell will assume the app is broken. `/today` says
 * "Nothing is wrong" in as many words, and that sentence is why.
 *
 * Never render an empty state for data that is still loading — that tells someone their
 * plan is missing when it is merely late.
 */
export function EmptyState({
  title,
  reason,
  action,
  className,
}: {
  title: string;
  /** Why it is empty, and what happens next. Not a restatement of the title. */
  reason: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <GlassPanel className={cn("border-dashed p-8 text-center", className)}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-prose text-sm/relaxed text-muted-foreground">
        {reason}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </GlassPanel>
  );
}

/**
 * An error state.
 *
 * `role="alert"` so it is announced rather than merely displayed. The message is written
 * for the reader, not copied from the exception: a database error string tells a customer
 * nothing and tells an attacker something.
 *
 * `retry` is offered only where retrying can actually help. A button that re-runs a
 * request certain to fail again is worse than no button, because it implies the failure
 * was theirs to fix.
 */
export function ErrorState({
  title = "That did not load",
  message,
  retry,
  className,
}: {
  title?: string;
  message: string;
  retry?: ReactNode;
  className?: string;
}) {
  return (
    <GlassPanel
      role="alert"
      className={cn("border-destructive/30 p-6 text-center", className)}
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="mx-auto mt-2 max-w-prose text-sm/relaxed text-muted-foreground">
        {message}
      </p>
      {retry && <div className="mt-5 flex justify-center">{retry}</div>}
    </GlassPanel>
  );
}
