"use client";

import React, { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type WellnessBackgroundVariant =
  | "botanical"
  | "nutrition"
  | "wellness"
  | "ocean"
  | "lime"
  | "meditation";

interface WellnessBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: WellnessBackgroundVariant;
  /** Controls readability overlay opacity over background image. Default is "medium" (85%) */
  overlayOpacity?: "light" | "medium" | "strong" | "none";
  children?: React.ReactNode;
  className?: string;
  glowPosition?: "top" | "center" | "bottom" | "none";
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => (typeof window !== "undefined" ? window.matchMedia(REDUCED_MOTION).matches : false),
    () => true
  );
}

const BACKGROUND_MAP: Record<WellnessBackgroundVariant, string> = {
  botanical: "/backgrounds/botanical-green.webp",
  nutrition: "/backgrounds/nutrition-orange.webp",
  wellness: "/backgrounds/wellness-pink.webp",
  ocean: "/backgrounds/ocean-blue.webp",
  lime: "/backgrounds/lime-green.webp",
  meditation: "/backgrounds/meditation-purple.webp",
};

/**
 * Reusable Adira Wellness Central Background System.
 *
 * Mounts real route-specific WebP background images with WCAG AAA compliant text readability
 * overlay washes, responsive image scaling, and prefers-reduced-motion support.
 */
export function WellnessBackground({
  variant = "botanical",
  overlayOpacity = "medium",
  children,
  className,
  glowPosition = "none",
  ...props
}: WellnessBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const bgImage = BACKGROUND_MAP[variant] || BACKGROUND_MAP.botanical;

  const overlayStyles: Record<"light" | "medium" | "strong" | "none", string> = {
    none: "bg-transparent",
    light: "bg-background/70 dark:bg-background/75 backdrop-blur-[1px]",
    medium: "bg-background/85 dark:bg-background/88 backdrop-blur-[2px]",
    strong: "bg-background/95 dark:bg-background/95 backdrop-blur-[4px]",
  };

  const glowStyles: Record<"top" | "center" | "bottom" | "none", string> = {
    top: "after:absolute after:top-0 after:left-1/2 after:-translate-x-1/2 after:w-3/4 after:h-48 after:bg-primary/10 after:blur-3xl after:pointer-events-none",
    center:
      "after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-2/3 after:h-64 after:bg-emerald-500/10 after:blur-3xl after:pointer-events-none",
    bottom:
      "after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-3/4 after:h-48 after:bg-teal-500/10 after:blur-3xl after:pointer-events-none",
    none: "",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-colors duration-500 bg-background text-foreground",
        glowStyles[glowPosition],
        className
      )}
      {...props}
    >
      {/* Real WebP Background Image Layer */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat transition-opacity duration-700",
          reducedMotion ? "opacity-25 dark:opacity-15" : "opacity-35 dark:opacity-25"
        )}
        style={{ backgroundImage: `url('${bgImage}')` }}
      />

      {/* WCAG AAA Readability Overlay Layer */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 transition-colors duration-300",
          overlayStyles[overlayOpacity]
        )}
      />

      {/* Foreground Content */}
      <div className="relative z-0">{children}</div>
    </div>
  );
}
