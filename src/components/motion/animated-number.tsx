"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * A number that counts to its value.
 *
 * THE RULE THIS COMPONENT MUST NOT BREAK
 *
 * It never displays an invented figure. `value` is the real number from the database;
 * the animation interpolates from the *previously displayed real value* to it, or from
 * zero on first paint. At no point does it show a plausible-looking number that came from
 * nowhere — `docs/METRICS.md` exists because a wrong metric is invisible: it still looks
 * like a number.
 *
 * `value` of `null` means "no data", and renders the placeholder — never `0`. A customer
 * who was given nothing to do has NO adherence, not zero, and animating to 0% would tell
 * them they failed.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Read through `useSyncExternalStore` rather than copying into state in an effect: the
 * server has no answer, and copying would render the animated value first and correct it
 * a frame later — which is itself a flash of motion for someone who asked for none.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => true, // Server default: assume reduced. Never animate on first paint.
  );
}

export interface AnimatedNumberProps {
  /** The real value. `null` means no data and renders `placeholder`. */
  value: number | null;
  /** Appended to the rendered number, e.g. "%". Not applied to the placeholder. */
  suffix?: string;
  /** Shown when `value` is null. An em dash, not a zero. */
  placeholder?: string;
  durationMs?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  suffix = "",
  placeholder = "—",
  durationMs = 600,
  className,
}: AnimatedNumberProps) {
  const reduced = usePrefersReducedMotion();

  // The last real value we displayed. Counting starts here, so a metric moving from
  // 82% to 91% animates across 9 points rather than sweeping up from zero every render.
  const previous = useRef<number>(0);
  const [displayed, setDisplayed] = useState<number>(value ?? 0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Under reduced motion the value is rendered directly, so there is deliberately no
    // state to set here — only the baseline to record, in case the preference changes
    // mid-session and the next update should animate from the right place.
    if (value === null || reduced) {
      if (value !== null) previous.current = value;
      return;
    }

    const from = previous.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease-out: fast at first, settling gently. A linear count reads mechanical.
      const eased = 1 - (1 - t) ** 3;
      setDisplayed(from + (to - from) * eased);

      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        previous.current = to;
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      // Record where we actually stopped, so an interrupted animation does not make the
      // next one start from a value that was never shown.
      previous.current = to;
    };
  }, [value, reduced, durationMs]);

  if (value === null) {
    return <span className={className}>{placeholder}</span>;
  }

  // Reduced motion renders the real value straight from props — no interpolation, no
  // state, and therefore no frame in which a partial number is on screen.
  const shown = reduced ? value : displayed;

  return (
    <span className={className}>
      {Math.round(shown)}
      {suffix}
    </span>
  );
}
