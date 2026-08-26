import { cn } from "@/lib/utils";

/**
 * A seated figure, breathing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A DRAWING AND NOT THE 3D CHARACTER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `/experience/yoga` has a real three.js scene, and it must stay there. ADR-014 and
 * `docs/UX-SPECIFICATION.md` §9 keep three.js lazy and off pages that do not need it, and
 * the landing page is the page most likely to be opened once, on a phone, over a slow
 * connection, by somebody deciding whether to bother. Shipping a WebGL context and a
 * loader to win a first impression is exactly the wrong trade — and the production
 * character does not exist yet anyway (15C).
 *
 * So this is inline SVG: a few hundred bytes, no request, no runtime, and it draws in the
 * theme's own tokens rather than baking a colour.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE MOTION IS THE POINT, AND IT IS ONE PROPERTY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The whole figure scales by 3.5% over an eight-second cycle — four seconds in, four out,
 * a resting respiratory rate. That is slow enough to read as breath rather than as a
 * pulsing interface element, and small enough not to pull the eye away from the words
 * beside it.
 *
 * `animate-breathe` is a shared primitive, and under `prefers-reduced-motion` it is set to
 * `animation: none`, which returns the figure to its authored resting pose. Not a frozen
 * mid-scale frame, which is what shortening the duration would leave behind.
 *
 * A SERVER component: there is nothing to hydrate, so there is no reason to ship it as
 * client JavaScript.
 */
export function BreathingFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 220"
      className={cn("size-full", className)}
      role="img"
      aria-label="A figure seated in a cross-legged meditation posture"
    >
      <defs>
        <linearGradient id="figure-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--brand-700)" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/*
        The breath rings. Concentric, faint, and scaling with the figure — they read as
        the space the breath occupies rather than as decoration around it.
      */}
      <g className="animate-breathe" style={{ transformOrigin: "100px 130px" }}>
        <circle
          cx="100"
          cy="130"
          r="86"
          fill="none"
          stroke="var(--jade)"
          strokeOpacity="0.20"
          strokeWidth="1"
        />
        <circle
          cx="100"
          cy="130"
          r="66"
          fill="none"
          stroke="var(--jade)"
          strokeOpacity="0.28"
          strokeWidth="1"
        />

        {/* Head */}
        <circle cx="100" cy="58" r="19" fill="url(#figure-fill)" />

        {/* Torso — a soft trapezoid, shoulders down to a seated base. */}
        <path
          d="M100 82
             c 20 0 30 14 33 32
             l 6 38
             c 2 12 -6 18 -17 18
             h -44
             c -11 0 -19 -6 -17 -18
             l 6 -38
             c 3 -18 13 -32 33 -32 z"
          fill="url(#figure-fill)"
        />

        {/* Crossed legs — one broad lozenge reads as the seated base more clearly than
            two separate limbs at this size. */}
        <path
          d="M52 172
             c 0 -10 21 -16 48 -16
             s 48 6 48 16
             c 0 11 -21 17 -48 17
             s -48 -6 -48 -17 z"
          fill="url(#figure-fill)"
          fillOpacity="0.85"
        />

        {/* Arms resting to the knees. */}
        <path
          d="M67 114 c -13 12 -18 32 -16 50"
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d="M133 114 c 13 12 18 32 16 50"
          fill="none"
          stroke="url(#figure-fill)"
          strokeWidth="11"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
