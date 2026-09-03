"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { BreathingFigure } from "@/app/(landing)/breathing-figure";

const YogaPoseShowcaseInternal = dynamic(
  () => import("@/components/3d/yoga-pose-showcase"),
  {
    ssr: false,
    loading: () => <BreathingFigure />,
  },
);

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
    () => true,
  );
}

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

let webglSupport: boolean | null = null;
function webglSnapshot(): boolean {
  webglSupport ??= detectWebGL();
  return webglSupport;
}
function subscribeNever() {
  return () => {};
}

function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(subscribeNever, webglSnapshot, () => null);
}

export function YogaPoseScene({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGLSupport();

  if (reduced || webgl === false) {
    return <BreathingFigure className={className} />;
  }

  if (webgl === null) {
    return <BreathingFigure className={className} />;
  }

  return (
    <div className={className}>
      <YogaPoseShowcaseInternal />
    </div>
  );
}
