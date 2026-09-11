"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { MealIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The diet scene's lazy boundary and its capability checks.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT `useState(checkWebGLSupport)`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It used to be, and it broke hydration on the landing page — an error visible in the
 * dev overlay and, far worse, invisible in production:
 *
 *   server:  typeof window === "undefined"  ->  false  ->  <DietFallbackVisual/>
 *   client:  window exists, WebGL works     ->  true   ->  <div><DynamicDietScene/></div>
 *
 * A lazy `useState` initialiser runs during the FIRST client render, which is the
 * hydrating one. Different branch, different markup, and React throws
 * "Hydration failed because the server rendered HTML didn't match the client".
 *
 * The consequence is not a cosmetic warning. React discards the server tree and
 * regenerates it on the client, which remounts every component beneath — including every
 * `Reveal` on the page. Each one returns to its `hidden` state and waits on a fresh
 * IntersectionObserver, so an entire landing page can paint blank because one 3D scene
 * probed for WebGL a render too early.
 *
 * `useSyncExternalStore` with a SERVER SNAPSHOT fixes it, and it is the pattern
 * `yoga-viewer.tsx` already established here. React uses `getServerSnapshot` for the
 * hydrating render, so server and client agree on markup; only afterwards does it read
 * the real value and swap. Capability is a fact about the device to be READ, never state
 * to be held.
 */

const DynamicDietScene = dynamic(() => import("@/components/3d/diet-wellness-scene"), {
  ssr: false,
  loading: () => <DietFallbackVisual />,
});

function DietFallbackVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex size-72 flex-col items-center justify-center space-y-4 rounded-3xl border border-amber-500/20 bg-background/80 p-8 text-center shadow-xl backdrop-blur-md sm:size-80",
        className,
      )}
    >
      <MealIcon size={64} className="text-amber-600 dark:text-amber-400" />
      <h3 className="text-lg font-semibold text-foreground">Personalized Meal Plan</h3>
      <p className="text-xs text-muted-foreground">
        Synchronized with your daily yoga and recovery schedule.
      </p>
    </div>
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
 * The probe context is explicitly released: browsers cap simultaneous WebGL contexts, and
 * leaking one per mount eventually starves the real scene.
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

/** Support cannot change, so it is probed once per document and never subscribed to. */
let webglSupport: boolean | null = null;

function webglSnapshot(): boolean {
  webglSupport ??= detectWebGL();
  return webglSupport;
}

function subscribeNever() {
  return () => {};
}

function useWebGLSupport(): boolean | null {
  // `null` on the server AND for the hydrating render — which is what keeps the two in
  // agreement. The real answer arrives on the next render.
  return useSyncExternalStore(subscribeNever, webglSnapshot, () => null);
}

export function Diet3DScene({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGLSupport();

  // `webgl === null` is the hydrating render. It must produce exactly what the server
  // produced, so it takes the same branch as "no WebGL".
  if (reduced || webgl !== true) {
    return <DietFallbackVisual className={className} />;
  }

  return (
    <div className={className}>
      <DynamicDietScene />
    </div>
  );
}
