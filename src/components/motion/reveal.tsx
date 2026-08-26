"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll-triggered reveal, and the reason it is built inside out.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CONTENT SHIPS VISIBLE. HIDING IS SOMETHING JAVASCRIPT OPTS INTO.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The obvious implementation renders `opacity: 0` and waits for an
 * IntersectionObserver to clear it. That implementation has a failure mode which is
 * indistinguishable from a broken page: if the observer never fires — hydration failed,
 * the bundle was blocked, the element was already above the viewport on load, the browser
 * is old — the reader is left looking at nothing, and nothing reports an error.
 *
 * So the hidden state is never in the server-rendered HTML. This component renders its
 * children plainly, then, in an effect that only runs in a browser that can animate,
 * marks itself hidden and observes. Every path that does not reach that line leaves the
 * content on screen:
 *
 *   no JavaScript · reduced motion · no IntersectionObserver · an error before mount
 *
 * The cost is one frame in which the content is visible before it hides, which is
 * invisible in practice because the effect runs before paint. The benefit is that the
 * page cannot be blanked by a script failure.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * REDUCED MOTION IS AN OPT-OUT, NOT A FASTER ANIMATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Under `prefers-reduced-motion: reduce` this does nothing at all — no hiding, no
 * observer, no transition. Relying on the global 0.01ms override would still hide the
 * element first, and an element that is hidden and then instantly shown is a flash, which
 * is exactly the class of movement the preference exists to prevent.
 */

export interface RevealProps extends React.ComponentProps<"div"> {
  /** How far it rises, in px. Kept small — this is emphasis, not travel. */
  distance?: number;
  /** Delay in ms. `Stagger` sets this per child; rarely worth setting by hand. */
  delay?: number;
  /** Fraction of the element that must be visible before it reveals. */
  threshold?: number;
}

function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof IntersectionObserver === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Reveal({
  distance = 8,
  delay = 0,
  threshold = 0.15,
  className,
  style,
  children,
  ...props
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  /*
   * Three states, and the initial one is deliberately not "hidden".
   *
   *   "static"  the server-rendered state, and the permanent state anywhere the
   *             animation cannot or should not run. No data attribute, no styles.
   *   "hidden"  set on mount only when the reveal will actually happen.
   *   "shown"   set when the element enters the viewport.
   */
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const node = ref.current;
    if (!node || !canAnimate()) return;

    setState("hidden");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState("shown");
          // Reveal once. Re-hiding on scroll-out means content flickers as somebody
          // scrolls back up a page they have already read.
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -5% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      // Absent while "static", which is what keeps the CSS from applying at all.
      data-reveal={state === "static" ? undefined : state}
      className={cn(className)}
      style={
        {
          ...style,
          "--reveal-distance": `${distance}px`,
          "--reveal-delay": `${delay}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Reveal a list of children in sequence.
 *
 * The stagger step is small on purpose. At 40ms a group of cards reads as one gesture
 * arriving; past about 80ms the reader starts waiting for the last one, and a list of
 * twelve becomes a full second of nothing happening.
 *
 * Capped for the same reason: after `maxStaggered` items every remaining child shares the
 * final delay, so a long list still finishes promptly instead of scaling linearly into an
 * unusable wait.
 */
export function Stagger({
  step = 40,
  maxStaggered = 8,
  distance,
  className,
  children,
  ...props
}: {
  step?: number;
  maxStaggered?: number;
  distance?: number;
} & React.ComponentProps<"div">) {
  const items = Array.isArray(children) ? children : [children];

  return (
    <div className={className} {...props}>
      {items.map((child, index) => (
        <Reveal
          key={index}
          delay={Math.min(index, maxStaggered) * step}
          {...(distance === undefined ? {} : { distance })}
        >
          {child}
        </Reveal>
      ))}
    </div>
  );
}
