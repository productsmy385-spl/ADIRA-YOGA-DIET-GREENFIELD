"use client";

import { useSyncExternalStore } from "react";

import { GlassPanel } from "@/components/glass/glass";
import { JOURNEY_SECTIONS, type YogaPose } from "@/components/3d/yoga-pose";
import { YogaViewer } from "@/components/3d/yoga-viewer";

/**
 * The scroll journey (15B).
 *
 * Seven sections, one narrative: Begin → Breathe → Move → Strengthen → Balance → Still →
 * Continue. Each section pins a viewer while its text scrolls past, so the practice stays
 * visible while the explanation changes — one continuous experience rather than seven
 * unrelated effects that happen to fire on scroll.
 *
 * SCROLL DRIVES POSITION, NOT A TIMELINE OF ITS OWN. `position: sticky` does the pinning
 * natively, which means the browser handles it on the compositor: no scroll listener, no
 * `requestAnimationFrame` fighting the main thread, and no jank on the mid-range Android
 * this product targets. A JS-driven camera path would look identical on a laptop and
 * stutter on the device that matters.
 *
 * UNDER REDUCED MOTION the pinning is dropped entirely and every section renders as a
 * plain stacked block. Nothing is hidden — the same seven sections, the same poses, the
 * same instructions, just no movement. Reduced motion removes movement, never
 * information.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

export function JourneyScroller({ poses }: { poses: YogaPose[] }) {
  const reduced = usePrefersReducedMotion();

  return (
    <main className="relative z-10">
      {JOURNEY_SECTIONS.map((section, index) => {
        // Poses cycle through the sections when the library is smaller than the arc.
        // Deliberate: the narrative is fixed at seven, the library is whatever the
        // organisation has, and repeating a real pose beats inventing one.
        const pose = poses.length > 0 ? poses[index % poses.length] : null;

        return (
          <section
            key={section.id}
            aria-labelledby={`journey-${section.id}`}
            className="mx-auto grid max-w-6xl gap-8 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:items-start lg:gap-16"
          >
            <div className={reduced ? undefined : "lg:sticky lg:top-24"}>
              <p className="type-meta text-muted-foreground">
                {String(index + 1).padStart(2, "0")} / {JOURNEY_SECTIONS.length}
              </p>

              <h2
                id={`journey-${section.id}`}
                className={`mt-3 text-foreground ${index === 0 ? "type-display" : "type-heading"}`}
              >
                {section.title}
              </h2>

              <p className="type-body mt-4 max-w-prose text-muted-foreground">
                {section.body}
              </p>

              {pose && (
                <p className="mt-6 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pose.name}</span>
                  {pose.sanskritName ? ` · ${pose.sanskritName}` : ""}
                </p>
              )}
            </div>

            <div>
              {pose ? (
                <YogaViewer pose={pose} />
              ) : (
                /*
                 * Signed-out, or an organisation with an empty library. Says so plainly
                 * rather than showing a placeholder figure that implies content exists —
                 * the same rule the empty states elsewhere follow.
                 */
                <GlassPanel className="flex aspect-4/3 items-center justify-center border-dashed p-8 text-center">
                  <p className="max-w-xs text-sm/relaxed text-muted-foreground">
                    Poses appear here once your organisation has added them to its yoga
                    library.
                  </p>
                </GlassPanel>
              )}
            </div>
          </section>
        );
      })}

      {/*
        The honesty note the roadmap requires while 15C is outstanding. It stays until a
        production character is integrated — a placeholder presented without comment is
        how a development asset gets mistaken for the finished product (risk V6).
      */}
      <p className="mx-auto max-w-6xl px-6 pb-20 text-xs text-muted-foreground">
        The 3D character is a development placeholder. Production yoga animations are not
        yet integrated, so each pose is shown with its written instructions — which remain
        the complete guidance either way.
      </p>
    </main>
  );
}
