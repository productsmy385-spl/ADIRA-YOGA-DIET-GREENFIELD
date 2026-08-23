"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { YogaFallback, type FallbackReason } from "./yoga-fallback";
import type { YogaPose } from "./yoga-pose";

/**
 * THE LAZY BOUNDARY. Everything 3D enters the application through this file.
 *
 * `three` + fiber + drei is roughly 550–700 KB gzipped. ADR-014 forbids it from reaching
 * `/today`, because the daily loop runs ~365 times a year per customer and a slower one
 * is a net loss however good it looks. `next/dynamic` with `ssr: false` is what keeps
 * that promise: the chunk is fetched when this component decides to render a scene, and
 * never as part of any page that merely imports the viewer.
 *
 * A static `import YogaScene from "./yoga-scene"` anywhere outside this file would undo
 * it silently — the bundle would grow and nothing would fail. `no-3d-on-today.test.ts`
 * is the guard.
 */

const YogaScene = dynamic(() => import("./yoga-scene"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

function SceneSkeleton() {
  return (
    <div
      aria-hidden
      className="aspect-4/3 w-full animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none"
    />
  );
}

/* ── capability detection ──────────────────────────────────────────────── */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true, // Server: assume reduced. Never start an animation on first paint.
  );
}

/**
 * Does this device actually have WebGL?
 *
 * Probed with a throwaway canvas rather than assumed from the user agent. Older Androids,
 * locked-down enterprise browsers and some in-app webviews report a modern UA and still
 * fail to give a context — and a customer on one of those must get the text alternative,
 * not a blank rectangle.
 *
 * The probe context is explicitly released: browsers cap simultaneous WebGL contexts
 * (often around 16), and leaking one per mount eventually breaks the real scene.
 */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;

    const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * WebGL support as an external store rather than component state.
 *
 * Support is a fact about the device: it is decided once, it never changes, and it is
 * shared by every viewer on the page. `useSyncExternalStore` says exactly that — the probe
 * runs at most once per document, the server snapshot is `null` so the server never
 * guesses, and React swaps in the real answer at hydration.
 *
 * The earlier shape was `useState(null)` plus `useEffect(() => setWebgl(detectWebGL()))`,
 * which produced the same pixels and an extra render, re-probed per instance, and tripped
 * the setState-in-effect rule. The rule was right: this was never state, it was a read.
 */
let webglSupport: boolean | null = null;

function webglSnapshot(): boolean {
  webglSupport ??= detectWebGL();
  return webglSupport;
}

/** Support cannot change, so there is nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

function useWebGLSupport(): boolean | null {
  // `null` on the server and for the hydrating render, so the first paint shows the
  // skeleton rather than flashing the text alternative on a capable device.
  return useSyncExternalStore(subscribeNever, webglSnapshot, () => null);
}

/**
 * Is the element on screen?
 *
 * Drives pausing. A `requestAnimationFrame` loop that keeps running while the canvas is
 * scrolled out of view burns battery for nothing — which on the mid-range phone this
 * product targets is measurable, and is the sort of thing a reviewer never sees because
 * it costs nothing on a laptop.
 */
function useOnScreen(ref: React.RefObject<HTMLDivElement | null>): boolean {
  /*
   * The no-IntersectionObserver case is the INITIAL VALUE, not a correction applied by an
   * effect. Without the API, never pausing is the safe default — a permanently paused
   * scene looks broken, whereas one that always renders merely costs battery — and
   * expressing that as a lazy initialiser means there is no first render that says
   * "hidden" and no synchronous setState to undo it.
   */
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px" }, // Start slightly before it arrives, so it is ready.
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
}

/* ── the viewer ────────────────────────────────────────────────────────── */

export interface YogaViewerProps {
  pose: YogaPose;
  /** Force the text alternative. Used by the reduced-data path and by tests. */
  forceFallback?: FallbackReason;
  className?: string;
}

/**
 * A single pose, with every degradation path the brief requires.
 *
 * The order of the checks is the accessibility contract:
 *
 *   reduced motion → static text alternative, no canvas, no download
 *   no WebGL       → text alternative
 *   no model       → text alternative
 *   otherwise      → the scene, paused while off-screen
 *
 * In every fallback the reader still receives the pose's name, Sanskrit name, duration
 * and instructions. 3D is never the only carrier of information — a consultant's
 * instruction must reach someone whose device cannot render it.
 */
export function YogaViewer({ pose, forceFallback, className }: YogaViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const onScreen = useOnScreen(container);

  const webgl = useWebGLSupport();

  const reason: FallbackReason | null = forceFallback
    ? forceFallback
    : reduced
      ? "reduced-motion"
      : webgl === false
        ? "no-webgl"
        : !pose.modelReference
          ? "no-model"
          : null;

  return (
    <div ref={container} className={className}>
      {reason ? (
        <YogaFallback pose={pose} reason={reason} />
      ) : webgl === null ? (
        // Probing. Showing the skeleton rather than the fallback avoids a flash of the
        // text alternative on a device that is perfectly capable.
        <SceneSkeleton />
      ) : (
        <YogaScene pose={pose} paused={!onScreen} />
      )}
    </div>
  );
}
