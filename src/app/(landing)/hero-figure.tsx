import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The hero visual: a seated figure inside slowly turning energy rings.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS REPLACED A WEBGL SCENE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `hero-wellness-scene.tsx` drew its meditating subject as a sphere, a capsule, a torus
 * and two more capsules. Abstract geometry is a defensible placeholder in a viewer
 * somebody opened deliberately — it is not defensible as the FIRST THING a visitor sees,
 * which is what it was.
 *
 * The rings, chakra points and drifting particles around it were worth keeping, so they
 * were kept — as CSS. Every one of them is a transform or an opacity, which the
 * compositor animates off the main thread. That buys back a WebGL context, a render
 * loop, and the main-thread cost of both, above the fold, on the page most likely to be
 * opened on a phone.
 *
 * This component is a SERVER component. It has no hooks, no `useSyncExternalStore` motion
 * probe and no `next/dynamic` boundary, because reduced motion is handled in CSS by
 * `globals.css` — which stops the ambient animations outright rather than freezing them
 * mid-scale. There is nothing here that needs to run in the browser to decide what to
 * draw, so nothing here ships as client JavaScript.
 */

/** Deterministic, so the server and client agree. `Math.random()` would hydrate-mismatch. */
const PARTICLES = [
  { top: "12%", left: "18%", size: "size-2", delay: "0s", tone: "bg-emerald-400/50" },
  { top: "24%", left: "82%", size: "size-1.5", delay: "-6s", tone: "bg-teal-400/50" },
  { top: "68%", left: "8%", size: "size-1.5", delay: "-12s", tone: "bg-amber-400/45" },
  { top: "78%", left: "76%", size: "size-2", delay: "-18s", tone: "bg-jade/50" },
  { top: "42%", left: "92%", size: "size-1", delay: "-24s", tone: "bg-emerald-400/40" },
  { top: "88%", left: "38%", size: "size-1", delay: "-3s", tone: "bg-sky-400/40" },
] as const;

export function HeroFigure({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-lg", className)}>
      {/* Ambient glow. Sits furthest back and is the only blurred layer here — the
          elevation budget in globals.css caps overlapping blur at two. */}
      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full bg-linear-to-br from-emerald-400/25 via-teal-300/20 to-amber-200/20 blur-3xl"
      />

      {/* Energy rings. Two, turning opposite ways at different speeds, so they never
          settle into a pattern the eye can lock onto. */}
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="absolute inset-0 size-full animate-orbit"
      >
        <circle
          cx="200"
          cy="200"
          r="182"
          fill="none"
          stroke="var(--emerald)"
          strokeOpacity="0.28"
          strokeWidth="1.5"
          strokeDasharray="2 10"
          strokeLinecap="round"
        />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="absolute inset-[6%] size-[88%] animate-orbit-reverse"
      >
        <circle
          cx="200"
          cy="200"
          r="188"
          fill="none"
          stroke="var(--jade)"
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeDasharray="60 260"
          strokeLinecap="round"
        />
      </svg>

      {/* Drifting motes. `animate-drift` is already the landing page's ambient motion and
          is already switched off under reduced motion. */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          style={{ top: p.top, left: p.left, animationDelay: p.delay }}
          className={cn(
            "absolute rounded-full animate-drift",
            p.size,
            p.tone,
          )}
        />
      ))}

      {/*
        The figure. `animate-breathe` gives it the one movement that matters.

        `priority` because this is the hero image and therefore almost certainly the
        Largest Contentful Paint element — leaving it lazy would let the page's headline
        render against an empty square and count the delay against LCP.
      */}
      <div className="relative z-10 size-full animate-breathe p-6">
        <Image
          src="/images/poses/lotus.webp"
          alt="A person seated cross-legged in meditation"
          fill
          sizes="(max-width: 1024px) 90vw, 512px"
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}
