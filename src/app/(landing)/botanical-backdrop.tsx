"use client";

import { useSyncExternalStore } from "react";

/**
 * The landing page's living background.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ALLOWED HERE AND NOWHERE ELSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `docs/UX-SPECIFICATION.md` §5 rules out ambient background movement, and gives a
 * specific reason: it competes with reading, and "for a customer opening the app at 5 am
 * it is actively unpleasant."
 *
 * That decision stands and is not being overturned. It is about the AUTHENTICATED
 * APPLICATION — surfaces somebody uses daily, at length, often tired. This is the public
 * landing page: a marketing surface, read once, for under a minute, by somebody deciding
 * whether Adira is a serious product. The reasoning that forbids motion there is the same
 * reasoning that permits it here.
 *
 * The file lives under `(landing)` rather than in `components/` to keep that boundary
 * visible: this is not a shared primitive, and importing it into an authenticated page
 * would be importing the thing the spec forbids.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT KEEPS IT CHEAP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Everything is inline SVG and CSS transforms — no canvas, no rAF loop, no particle
 * system, no images. The shapes animate `transform` only, which the compositor handles
 * without touching layout or paint. There are three animated layers, not thirty.
 *
 * The blur is applied ONCE, as an SVG filter on the shape group, rather than as a CSS
 * `backdrop-filter`. Glass surfaces on top of this already spend the page's blur budget,
 * and `docs/UX-SPECIFICATION.md` caps overlapping blurred layers at two.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DEGRADING ON A WEAK DEVICE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A low-core or low-memory phone gets the gradient and the shapes, but no animation. The
 * check runs after mount, so the server-rendered markup is the static version and the
 * animation is added only where it is affordable — the same direction of travel as
 * `Reveal`: the cheap thing is the default, the expensive thing is opted into.
 */

interface DeviceMemoryNavigator extends Navigator {
  deviceMemory?: number;
}

function isCapableDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const nav = window.navigator as DeviceMemoryNavigator;

  // Both are advisory and widely unimplemented, so the test is "known to be weak",
  // never "known to be strong" — an unknown device gets the animation.
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) {
    return false;
  }
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) {
    return false;
  }

  return true;
}

/** Capability never changes after load, so nothing needs to subscribe. */
const noSubscription = () => () => {};

export function BotanicalBackdrop() {
  /*
   * `useSyncExternalStore` rather than an effect writing state — the same pattern
   * `passkey-sign-in.tsx` uses for its WebAuthn check, and for the same reason.
   *
   * The server has no answer to "is this device capable", so it renders the static
   * version. React re-reads after hydration and the animation appears if it is
   * affordable. Copying the value into state via an effect would produce an extra render
   * and a frame where the wrong thing is on screen; here the server snapshot IS the safe
   * default.
   */
  const animated = useSyncExternalStore(noSubscription, isCapableDevice, () => false);

  return (
    <div
      aria-hidden
      // `fixed` so the shapes stay put while content scrolls over them, which produces
      // parallax for free — no scroll listener, no transform-on-scroll, no jank.
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/*
        The base wash and the noise come from `.bg-canvas` on the page element, NOT from
        here. That class is the UX spec §5 background system and already layers a base
        gradient, two botanical fields and a 3% noise texture. Re-declaring a gradient
        here would be a second background system disagreeing with the first — and the
        noise in particular is what stops these large soft shapes banding on a cheap
        panel, so it must sit ABOVE them rather than below.

        This component contributes exactly one thing on top of that: movement.
      */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          <filter id="botanical-soften" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="46" />
          </filter>

          <radialGradient id="botanical-sage" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--jade)" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="botanical-saffron" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--saffron)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--saffron)" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="botanical-brand" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--brand-400)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--brand-400)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g filter="url(#botanical-soften)">
          {/* Three layers at different speeds and directions. They are deliberately not
              harmonically related, so the eye never locks onto a repeating beat. */}
          <ellipse
            cx="240"
            cy="200"
            rx="330"
            ry="270"
            fill="url(#botanical-sage)"
            className={animated ? "animate-drift" : undefined}
            style={{ transformOrigin: "240px 200px" }}
          />
          <ellipse
            cx="980"
            cy="330"
            rx="300"
            ry="240"
            fill="url(#botanical-saffron)"
            className={animated ? "animate-drift-slow" : undefined}
            style={{ transformOrigin: "980px 330px" }}
          />
          <ellipse
            cx="620"
            cy="760"
            rx="420"
            ry="260"
            fill="url(#botanical-brand)"
            className={animated ? "animate-drift" : undefined}
            style={{ transformOrigin: "620px 760px", animationDelay: "-14s" }}
          />
        </g>
      </svg>

    </div>
  );
}
